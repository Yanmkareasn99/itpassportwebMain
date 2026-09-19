import { supabase } from './supabase';
import type { Question } from '../types';

export const QUESTION_FLAG_LEVELS = ['green', 'orange', 'red'] as const;
export type QuestionFlagLevel = (typeof QUESTION_FLAG_LEVELS)[number];

export interface QuestionFlag {
  user_id: string;
  question_id: string;
  level: QuestionFlagLevel;
  created_at: string;
  updated_at: string;
}

export async function loadQuestionFlags(userId: string) {
  const flags: QuestionFlag[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('question_flags')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(from, from + 499);
    if (error) throw error;
    flags.push(...(data ?? []) as QuestionFlag[]);
    if (!data || data.length < 500) return flags;
  }
}

export async function setQuestionFlag(
  userId: string,
  questionId: string,
  level: QuestionFlagLevel | null,
) {
  if (level === null) {
    const { error } = await supabase.from('question_flags').delete()
      .eq('user_id', userId).eq('question_id', questionId);
    if (error) throw error;
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('question_flags').upsert({
    user_id: userId,
    question_id: questionId,
    level,
    updated_at: now,
  }, { onConflict: 'user_id,question_id' });
  if (error) throw error;
}

export async function loadFlaggedQuestions(
  userId: string,
  level?: QuestionFlagLevel,
) {
  const flags = (await loadQuestionFlags(userId))
    .filter(flag => !level || flag.level === level);
  if (!flags.length) return [];

  const byId = new Map<string, Question>();
  for (let offset = 0; offset < flags.length; offset += 100) {
    const ids = flags.slice(offset, offset + 100).map(flag => flag.question_id);
    const { data, error } = await supabase.from('questions')
      .select('*, answer_choices(*)').in('id', ids);
    if (error) throw error;
    for (const question of data ?? []) byId.set(question.id, question as Question);
  }

  return flags.map(flag => byId.get(flag.question_id)).filter((question): question is Question => Boolean(question));
}
