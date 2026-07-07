import { serve } from 'std/server';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

serve(async (req) => {
  try {
    const body = await req.json();
    const prompt = body.prompt;
    const userMessages: ChatMessage[] = body.messages ?? [];
    const model = body.model ?? 'gpt-4o-mini';

    // Prefer server-side OpenAI key
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('VITE_OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'No OpenAI key configured on the server.' }), { status: 500 });
    }

    const systemPrompt = body.systemPrompt ?? 'You are a helpful AI tutor. Answer concisely in Japanese.';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
      { role: 'user', content: prompt },
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
