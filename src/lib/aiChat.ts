import { Question, Subject } from '../types';
import { translate, type Language } from '../i18n';
import { isSupabaseEnabled, supabase } from './supabase';

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
  language: Language;
  profileName?: string;
  subject?: Subject | null;
  recentQuestions: Question[];
  history: ChatTurn[];
}

function summarizeQuestions(questions: Question[], language: Language) {
  if (questions.length === 0) return translate(language, 'aiChat.noRecentQuestions');
  return questions
    .slice(0, 3)
    .map(q => translate(language, 'aiChat.questionSummary', {
      number: q.question_number,
      text: q.question_text,
    }))
    .join('\n');
}

function buildLocalAnswer(prompt: string, context: ChatContext) {
  const lower = prompt.toLowerCase();
  const isPlan = /計画|スケジュール|勉強|学習|plan|schedule|study|kế hoạch|lịch|học/.test(lower);
  const isDifficulty = /難しい|苦手|わからない|理解|difficult|weak|understand|khó|yếu|hiểu/.test(lower);
  const subjectName = context.subject?.name ?? translate(context.language, 'aiChat.currentSubject');

  if (isPlan) {
    return [
      translate(context.language, 'aiChat.planIntro', { name: context.profileName ?? translate(context.language, 'common.you') }),
      translate(context.language, 'aiChat.planStep1', { subject: subjectName }),
      translate(context.language, 'aiChat.planStep2'),
      translate(context.language, 'aiChat.planStep3'),
    ].join('\n');
  }

  if (isDifficulty) {
    return [
      translate(context.language, 'aiChat.difficultyStep1', { subject: subjectName }),
      translate(context.language, 'aiChat.difficultyStep2'),
      translate(context.language, 'aiChat.difficultyStep3'),
    ].join('\n');
  }

  if (/午後|アルゴリズム|ネットワーク|セキュリティ|afternoon|algorithm|network|security|buổi chiều|thuật toán|mạng|bảo mật/.test(lower)) {
    return [
      translate(context.language, 'aiChat.afternoonStep1'),
      translate(context.language, 'aiChat.afternoonStep2'),
    ].join('\n');
  }

  return `${translate(context.language, 'aiChat.defaultReply')}\n\n${translate(context.language, 'aiChat.recentExamples', {
    questions: summarizeQuestions(context.recentQuestions, context.language),
  })}`;
}

function buildSystemPrompt(context: ChatContext) {
  const subjectName = context.subject?.name ?? translate(context.language, 'aiChat.currentSubject');
  const recentQuestions = summarizeQuestions(context.recentQuestions, context.language);

  return [
    translate(context.language, 'aiChat.systemRole'),
    translate(context.language, 'aiChat.systemLanguage'),
    translate(context.language, 'aiChat.systemStructure'),
    translate(context.language, 'aiChat.systemAudience'),
    translate(context.language, 'aiChat.systemSubject', { subject: subjectName }),
    translate(context.language, 'aiChat.systemLearner', { name: context.profileName ?? translate(context.language, 'common.you') }),
    translate(context.language, 'aiChat.systemRecentQuestions', { questions: recentQuestions }),
  ].join('\n');
}

async function tryRemoteAnswer(prompt: string, context: ChatContext) {
  if (!isSupabaseEnabled) return null;

  const systemPrompt = buildSystemPrompt(context);
  const userMessages = context.history.slice(-12).map(turn => ({ role: turn.role, content: turn.content }));

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { prompt, messages: userMessages, systemPrompt },
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || !('reply' in data)) return null;
  const reply = (data as { reply?: unknown }).reply;
  return typeof reply === 'string' && reply.trim() ? reply.trim() : null;
}

export async function getChatReply(prompt: string, context: ChatContext) {
  try {
    const remote = await tryRemoteAnswer(prompt, context);
    if (remote) return remote;
  } catch (err) {
    console.error('[AI] Remote call failed, falling back:', err);
  }

  return buildLocalAnswer(prompt, context);
}
