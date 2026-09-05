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

export async function getQuestionExplanation(
  questionText: string,
  options: string[],
  userAnswerIndex: number,
  correctAnswerIndex: number,
  language: Language,
  profileName?: string
) {
  if (!isSupabaseEnabled) {
    return `Let's break down this question step by step:\n\n1. First, understand what is being asked in one sentence.\n2. Review the meaning of key terms in the question.\n3. Compare each option against what you've understood.\n4. The correct answer is option ${String.fromCharCode(65 + correctAnswerIndex)}. Consider why it fits better than your choice (${String.fromCharCode(65 + userAnswerIndex)}).`;
  }

  const systemPrompt = `You are an expert educator specializing in IT Passport exam preparation. Your role is to help students understand why they got a question wrong and how to approach similar questions in the future.

When explaining a question:
1. Acknowledge their attempt with respect
2. Clarify what the question is really asking
3. Explain the key concepts related to the question
4. Explain why the correct answer is right
5. Explain why their chosen answer was incorrect
6. Provide a learning tip for similar questions

Be concise but thorough. Use simple language. ${profileName ? `Help ${profileName} understand better.` : ''}`;

  const userPrompt = `Here's a question from the IT Passport exam:

Question: ${questionText}

Options:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

I chose: ${String.fromCharCode(65 + userAnswerIndex)}
Correct answer: ${String.fromCharCode(65 + correctAnswerIndex)}

Please explain why the correct answer is right and help me understand this concept better.`;

  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { 
        prompt: userPrompt, 
        messages: [],
        systemPrompt 
      },
    });

    if (error) throw error;
    if (data && typeof data === 'object' && 'reply' in data) {
      const reply = (data as { reply?: unknown }).reply;
      if (typeof reply === 'string' && reply.trim()) {
        return reply.trim();
      }
    }
  } catch (err) {
    console.error('[AI] Question explanation failed:', err);
  }

  // Fallback with more meaningful content
  return `Let's break down this question:\n\n**What's being asked:** Analyze the question to understand the core concept being tested.\n\n**Your answer:** Option ${String.fromCharCode(65 + userAnswerIndex)}\n**Correct answer:** Option ${String.fromCharCode(65 + correctAnswerIndex)}\n\nThe correct answer (${String.fromCharCode(65 + correctAnswerIndex)}) is right because it directly addresses the key concept of the question. Your choice may have been a common misconception. Try to identify what you misunderstood and recall the proper definition for this topic.`;
}
