import { Question, Subject } from '../types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  profileName?: string;
  subject?: Subject | null;
  recentQuestions: Question[];
  history: ChatTurn[];
}

const DEFAULT_REPLY =
  '学習内容について質問できます。たとえば「基本情報の午後問題をどう勉強すればいい？」や「この問題の考え方を教えて」と聞いてください。';

function getEnv(key: keyof ImportMetaEnv) {
  return import.meta.env[key] as string | undefined;
}

function summarizeQuestions(questions: Question[]) {
  if (questions.length === 0) return '直近の問題データはありません。';
  return questions
    .slice(0, 3)
    .map(q => `問${q.question_number}: ${q.question_text}`)
    .join('\n');
}

function buildLocalAnswer(prompt: string, context: ChatContext) {
  const lower = prompt.toLowerCase();
  const isPlan = /計画|スケジュール|勉強|学習/.test(prompt);
  const isDifficulty = /難しい|苦手|わからない|理解/.test(prompt);
  const subjectName = context.subject?.name ?? '現在の科目';

  if (isPlan) {
    return [
      `${context.profileName ?? 'あなた'}向けの学習プランです。`,
      `1. ${subjectName}の重要用語を先に確認する`,
      '2. 問題演習を解いたあと、解説を1問ずつ要約する',
      '3. 間違えた論点だけをAIチャットで質問し直す',
    ].join('\n');
  }

  if (isDifficulty) {
    return [
      `${subjectName}でつまずいたときは、まず「何を問われているか」を1文で言い換えるのが有効です。`,
      '次に、選択肢を先に見ずに用語の意味を思い出してから答えを選ぶと、消去法より理解が進みます。',
      '必要なら、問題文をそのまま送ってくれれば考え方を分解して説明します。',
    ].join('\n');
  }

  if (/午後|アルゴリズム|ネットワーク|セキュリティ/.test(lower)) {
    return [
      '午後問題は、いきなり全文を理解しようとせず、設問と図表から先に読むのがコツです。',
      'キーワードを拾って、問われている範囲を限定してから本文に戻ると読みやすくなります。',
    ].join('\n');
  }

  return `${DEFAULT_REPLY}\n\n直近の問題例:\n${summarizeQuestions(context.recentQuestions)}`;
}

function buildSystemPrompt(context: ChatContext) {
  const subjectName = context.subject?.name ?? '現在の科目';
  const recentQuestions = summarizeQuestions(context.recentQuestions);

  return [
    'あなたは学習支援のAIチューターです。',
    '日本語で、簡潔かつ実践的に答えてください。',
    '必要なら箇条書きや手順に分けて説明してください。',
    '高校・専門学校の学習者にもわかる表現を優先してください。',
    `対象科目: ${subjectName}`,
    `学習者: ${context.profileName ?? '不明'}`,
    `最近の問題データ:\n${recentQuestions}`,
  ].join('\n');
}

async function tryRemoteAnswer(prompt: string, context: ChatContext) {
  const endpoint = getEnv('VITE_AI_CHAT_ENDPOINT');
  const apiKey = getEnv('VITE_AI_CHAT_API_KEY') ?? getEnv('VITE_OPENAI_API_KEY');
  const model = getEnv('VITE_AI_CHAT_MODEL') ?? getEnv('VITE_OPENAI_MODEL') ?? 'gpt-4o-mini';
  const geminiApiKey = getEnv('VITE_GEMINI_API_KEY');
  const geminiModel = getEnv('VITE_GEMINI_MODEL') ?? 'gemini-2.0-flash-lite';

  const usingGemini = Boolean(geminiApiKey && !endpoint && !apiKey);
  const usingOpenAI = Boolean(apiKey && !endpoint);

  const effectiveEndpoint = endpoint
    ?? (apiKey ? 'https://api.openai.com/v1/chat/completions' : null)
    ?? (geminiApiKey ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}` : null);

  if (!effectiveEndpoint) {
    console.log('[AI] No API configured');
    return null;
  }

  console.log('[AI] Using:', { usingGemini, usingOpenAI, endpoint: !!endpoint });

  const systemPrompt = buildSystemPrompt(context);
  const userMessages = context.history.slice(-12).map(turn => ({ role: turn.role, content: turn.content }));

  const body = usingGemini
    ? {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          ...userMessages
            .map(message => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
        },
      }
    : usingOpenAI
      ? {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...userMessages,
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        }
      : {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...userMessages,
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        };

  console.log('[AI] Request body keys:', Object.keys(body));

  const response = await fetch(effectiveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI] API error:', response.status, errorText);
    throw new Error(`AI endpoint error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[AI] Response received');

  const text = usingGemini
    ? (data?.candidates?.[0]?.content?.parts ?? [])
        .map((part: { text?: string }) => part.text ?? '')
        .join('')
        .trim()
    : (data?.choices?.[0]?.message?.content ?? data.output_text ?? data.reply ?? '').toString().trim();

  console.log('[AI] Extracted text length:', text?.length ?? 0);
  return text || null;
}

export async function getChatReply(prompt: string, context: ChatContext) {
  try {
    const remote = await tryRemoteAnswer(prompt, context);
    if (remote) {
      console.log('[AI] Using real API');
      return remote;
    }
  } catch (err) {
    console.error('[AI] Remote call failed, falling back:', err);
  }

  console.log('[AI] Using local fallback');
  return buildLocalAnswer(prompt, context);
}
