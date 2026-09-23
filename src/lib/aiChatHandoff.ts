import type { ChatTurn } from './aiChat';

const AI_CHAT_HANDOFF_KEY = 'manabi-ai-chat-handoff';
const MAX_HANDOFF_CONTENT_LENGTH = 12_000;

interface AiChatHandoff {
  turns: [ChatTurn, ChatTurn];
  createdAt: number;
}

export function queueAiChatHandoff(userMessage: string, assistantMessage: string) {
  if (typeof window === 'undefined') return;

  const handoff: AiChatHandoff = {
    turns: [
      { role: 'user', content: userMessage.slice(0, MAX_HANDOFF_CONTENT_LENGTH) },
      { role: 'assistant', content: assistantMessage.slice(0, MAX_HANDOFF_CONTENT_LENGTH) },
    ],
    createdAt: Date.now(),
  };

  window.sessionStorage.setItem(AI_CHAT_HANDOFF_KEY, JSON.stringify(handoff));
}

export function takeAiChatHandoff(): AiChatHandoff | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(AI_CHAT_HANDOFF_KEY);
  window.sessionStorage.removeItem(AI_CHAT_HANDOFF_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<AiChatHandoff>;
    if (!Array.isArray(value.turns) || value.turns.length !== 2) return null;
    const [userTurn, assistantTurn] = value.turns;
    if (
      userTurn?.role !== 'user'
      || assistantTurn?.role !== 'assistant'
      || typeof userTurn.content !== 'string'
      || typeof assistantTurn.content !== 'string'
      || !userTurn.content.trim()
      || !assistantTurn.content.trim()
    ) {
      return null;
    }

    return {
      turns: [userTurn, assistantTurn],
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}
