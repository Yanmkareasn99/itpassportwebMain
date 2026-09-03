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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !geminiKey) {
      return json({ error: 'Server configuration is incomplete.' }, 500);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid authentication token.' }, 401);

    const body = await req.json() as ChatRequest;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) return json({ error: 'Prompt must contain 1–4000 characters.' }, 400);

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
    // Gemini calls assistant messages "model"
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
  console.error(
    'Gemini request failed',
    upstream.status,
    data.error?.message,
  );
  return json({ error: 'The AI service is currently unavailable.' }, 502);
}

const reply = data.candidates?.[0]?.content?.parts
  ?.map(part => part.text ?? '')
  .join('')
  .trim();

if (!reply) {
  console.error(
    'Gemini returned no text',
    data.promptFeedback?.blockReason,
    data.candidates?.[0]?.finishReason,
  );
  return json({ error: 'The AI service returned an empty response.' }, 502);
}
    return json({ reply });
  } catch (error) {
    console.error('AI chat function failed', error);
    return json({ error: 'Unable to process the request.' }, 500);
  }
});
