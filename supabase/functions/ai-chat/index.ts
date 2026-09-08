import { createClient } from 'npm:@supabase/supabase-js@2';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  prompt?: unknown;
  messages?: unknown;
  systemPrompt?: unknown;
}

const DEFAULT_ALLOWED_ORIGIN = 'https://itpassportweb-app.vercel.app';
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; resetTime: number }>();

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigin(requestOrigin: string | null) {
  const origins = allowedOrigins();
  if (!requestOrigin) return origins[0];
  return origins.includes(requestOrigin) ? requestOrigin : null;
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function consumeRateLimit(userId: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);

  if (!bucket || now >= bucket.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(userId, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetTime };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: bucket.resetTime };
  }

  bucket.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - bucket.count, resetTime: bucket.resetTime };
}

Deno.serve(async (req) => {
  const origin = getAllowedOrigin(req.headers.get('Origin'));
  if (!origin) return new Response('Origin not allowed.', { status: 403 });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401, origin);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !geminiKey) {
      return json({ error: 'Server configuration is incomplete.' }, 500, origin);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid authentication token.' }, 401, origin);

    const rateLimit = consumeRateLimit(user.id);
    if (!rateLimit.allowed) {
      return json({ error: 'AI rate limit exceeded.', resetTime: rateLimit.resetTime }, 429, origin);
    }

    const body = await req.json() as ChatRequest;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) return json({ error: 'Prompt must contain 1-4000 characters.' }, 400, origin);

    const messages: ChatMessage[] = Array.isArray(body.messages)
      ? body.messages
          .filter((message): message is ChatMessage => {
            if (!message || typeof message !== 'object') return false;
            const candidate = message as Record<string, unknown>;
            return (candidate.role === 'user' || candidate.role === 'assistant')
              && typeof candidate.content === 'string';
          })
          .slice(-12)
          .map(message => ({ role: message.role, content: message.content.slice(0, 4000) }))
      : [];

    const systemPrompt = typeof body.systemPrompt === 'string'
      ? body.systemPrompt.slice(0, 8000)
      : 'You are a helpful AI tutor. Answer concisely in Japanese.';
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';

    const contents = [
      ...messages.map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1000,
          },
        }),
      },
    );

    const data = await upstream.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
      }>;
      promptFeedback?: {
        blockReason?: string;
      };
      error?: {
        message?: string;
      };
    };

    if (!upstream.ok) {
      console.error('Gemini request failed', upstream.status, data.error?.message);
      return json({ error: 'The AI service is currently unavailable.' }, 502, origin);
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text ?? '')
      .join('')
      .trim();

    if (!reply) {
      console.error('Gemini returned no text', data.promptFeedback?.blockReason, data.candidates?.[0]?.finishReason);
      return json({ error: 'The AI service returned an empty response.' }, 502, origin);
    }

    return json({ reply, rateLimit: { remaining: rateLimit.remaining, resetTime: rateLimit.resetTime } }, 200, origin);
  } catch (error) {
    console.error('AI chat function failed', error);
    return json({ error: 'Unable to process the request.' }, 500, origin);
  }
});
