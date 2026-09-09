import { supabase } from './supabase';
import type { Question, PracticeSession } from '../types';

export interface PracticeAnswer {
  questionId: string;
  choiceId: string;
  isCorrect: boolean;
}

export function practiceErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export async function loadPracticeSessions(userId: string) {
  const sessions: PracticeSession[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('practice_sessions').select('*')
      .eq('user_id', userId).order('id').range(offset, offset + 499);
    if (error) throw error;
    sessions.push(...(data ?? []) as PracticeSession[]);
    if (!data || data.length < 500) return sessions;
  }
}

export async function loadLatestAnswerStatus(userId: string, sessions?: PracticeSession[]) {
  const ownSessions = sessions ?? await loadPracticeSessions(userId);
  const latest = new Map<string, { id: string; answered_at: string; is_correct: boolean }>();
  for (let batch = 0; batch < ownSessions.length; batch += 50) {
    const ids = ownSessions.slice(batch, batch + 50).map(session => session.id);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('session_answers')
        .select('id, question_id, is_correct, answered_at').in('session_id', ids)
        .order('answered_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      for (const answer of data ?? []) {
        const previous = latest.get(answer.question_id);
        if (!previous || answer.answered_at > previous.answered_at
          || (answer.answered_at === previous.answered_at && answer.id > previous.id)) {
          latest.set(answer.question_id, answer);
        }
      }
      if (!data || data.length < 500) break;
    }
  }
  return new Map([...latest].map(([id, answer]) => [id, answer.is_correct]));
}

export async function createPracticeSession(userId: string, subjectId: string, questions: Question[]) {
  const { data, error } = await supabase.from('practice_sessions').insert({
    user_id: userId, subject_id: subjectId === 'all' || subjectId === 'review' ? null : subjectId,
    total_questions: questions.length, question_ids: questions.map(question => question.id),
  }).select().single();
  if (error) throw error;
  if (!data?.id) throw new Error('Unable to create practice session.');
  return data.id as string;
}

export async function loadPracticeSession(userId: string, sessionId: string) {
  const { data: session, error } = await supabase.from('practice_sessions').select('*')
    .eq('id', sessionId).eq('user_id', userId).single();
  if (error) throw error;
  if (!session?.question_ids?.length) throw new Error('This practice session cannot be resumed. Please start a new session.');
  const ids = session.question_ids as string[];
  const questions = new Map<string, Question>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error: questionError } = await supabase.from('questions').select('*, answer_choices(*)')
      .in('id', ids.slice(offset, offset + 100));
    if (questionError) throw questionError;
    for (const question of data ?? []) questions.set(question.id, question as Question);
  }
  if (ids.some(id => !questions.has(id))) throw new Error('Some questions in this session are no longer available. Please start a new session.');
  const answers = new Map<string, PracticeAnswer>();
  for (let offset = 0; ; offset += 500) {
    const { data, error: answerError } = await supabase.from('session_answers')
      .select('question_id, selected_choice_id, is_correct').eq('session_id', sessionId)
      .order('answered_at').order('id').range(offset, offset + 499);
    if (answerError) throw answerError;
    for (const answer of data ?? []) {
      if (questions.has(answer.question_id)) answers.set(answer.question_id, {
        questionId: answer.question_id, choiceId: answer.selected_choice_id, isCorrect: answer.is_correct,
      });
    }
    if (!data || data.length < 500) break;
  }
  return { questions: ids.map(id => questions.get(id)!), answers: [...answers.values()], finished: Boolean(session.completed_at) };
}

export async function fetchPracticeQuestions(
  subjectIds: string[] | null,
  diffFilter: DifficultyFilter,
  formatFilter: FormatFilter,
): Promise<Question[]> {
  const questions: Question[] = [];

  for (let from = 0; ; from += 500) {
    let query = supabase
      .from('questions')
      .select('*, answer_choices(*)');

    if (subjectIds) query = query.in('subject_id', subjectIds);

    if (diffFilter === 'easy') {
      query = query.eq('difficulty', 1);
    } else if (diffFilter === 'medium') {
      query = query.in('difficulty', [2, 3]);
    } else if (diffFilter === 'hard') {
      query = query.in('difficulty', [4, 5]);
    }

    if (formatFilter !== 'all') {
      query = query.eq('question_type', formatFilter);
    }

    const { data, error } = await query
      .order('question_number')
      .order('id')
      .range(from, from + 500 - 1);

    if (error) throw error;

    const page = (data ?? []) as Question[];
    questions.push(...page);
    if (page.length < 500) break;
  }

  return questions;
}

export type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
export type FormatFilter = 'all' | 'multiple_choice' | 'tree';
export type ModeFilter = 'all' | 'new' | 'review';

export interface PracticeProgressSession extends PracticeSession {
  answered_count: number;
}

export async function loadPracticeProgress(userId: string): Promise<PracticeProgressSession[]> {
  const sessions = await loadPracticeSessions(userId);
  const answers = new Map<string, { sessionId: string; correct: boolean }>();
  for (let batch = 0; batch < sessions.length; batch += 50) {
    const ids = sessions.slice(batch, batch + 50).map(session => session.id);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('session_answers')
        .select('session_id, question_id, is_correct').in('session_id', ids)
        .order('answered_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      for (const answer of data ?? []) {
        // A resumed question counts once per attempt; retries in a new session count again.
        answers.set(`${answer.session_id}:${answer.question_id}`, { sessionId: answer.session_id, correct: answer.is_correct });
      }
      if (!data || data.length < 500) break;
    }
  }
  const totals = new Map<string, { answered: number; correct: number }>();
  for (const answer of answers.values()) {
    const total = totals.get(answer.sessionId) ?? { answered: 0, correct: 0 };
    total.answered++;
    if (answer.correct) total.correct++;
    totals.set(answer.sessionId, total);
  }
  return sessions.map(session => ({
    ...session,
    answered_count: totals.get(session.id)?.answered ?? 0,
    correct_answers: totals.get(session.id)?.correct ?? 0,
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
