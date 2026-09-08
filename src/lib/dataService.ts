/**
 * Data fetching service with consistent error handling and logging
 * Wraps all Supabase queries with standardized error recovery
 */

import { supabase } from './supabase';
import { handleSupabaseError, errorLogger } from './errorHandling';
import type { PracticeSession, Profile, Question } from '../types';

type JsonObject = Record<string, unknown>;
type ChatRole = 'user' | 'assistant';
type ChatMessageRow = JsonObject & { user_id: string; content: string; role: ChatRole };
type CategoryRow = JsonObject & { id?: string; name?: string };
type ExamResultRow = JsonObject;
type ExamScheduleRow = JsonObject;
type SavedAnswerRow = JsonObject;

/**
 * Fetch questions by category with error handling
 */
export async function fetchQuestionsByCategory(
  categoryId: string,
  limit: number = 50
): Promise<Question[]> {
  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('category_id', categoryId)
      .limit(limit);

    if (error) throw error;
    return (data || []) as Question[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchQuestionsByCategory');
    errorLogger.error(`Failed to fetch questions for category ${categoryId}`, err);
    throw appError;
  }
}

/**
 * Fetch user profile with error handling
 */
export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // ignore "not found" error
    return (data || null) as Profile | null;
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchUserProfile');
    errorLogger.error(`Failed to fetch profile for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Fetch user's practice sessions with error handling
 */
export async function fetchPracticeSessions(
  userId: string,
  limit: number = 100
): Promise<PracticeSession[]> {
  try {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as PracticeSession[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchPracticeSessions');
    errorLogger.error(`Failed to fetch practice sessions for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Fetch exam results with error handling
 */
export async function fetchExamResults(
  userId: string,
  limit: number = 50
): Promise<ExamResultRow[]> {
  try {
    const { data, error } = await supabase
      .from('exam_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as ExamResultRow[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchExamResults');
    errorLogger.error(`Failed to fetch exam results for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Save answer to practice session with error handling
 */
export async function saveAnswer(
  userId: string,
  questionId: string,
  selectedAnswerIndex: number,
  isCorrect: boolean
): Promise<SavedAnswerRow> {
  try {
    const { data, error } = await supabase
      .from('practice_sessions')
      .insert([
        {
          user_id: userId,
          question_id: questionId,
          selected_answer: selectedAnswerIndex,
          is_correct: isCorrect,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as SavedAnswerRow;
  } catch (err) {
    const appError = handleSupabaseError(err, 'saveAnswer');
    errorLogger.error(
      `Failed to save answer for user ${userId}, question ${questionId}`,
      err
    );
    throw appError;
  }
}

/**
 * Update user profile with error handling
 */
export async function updateUserProfile(
  userId: string,
  updates: Record<string, unknown>
): Promise<Profile> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  } catch (err) {
    const appError = handleSupabaseError(err, 'updateUserProfile');
    errorLogger.error(`Failed to update profile for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Fetch AI chat history with error handling
 */
export async function fetchChatHistory(
  userId: string,
  limit: number = 50
): Promise<ChatMessageRow[]> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as ChatMessageRow[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchChatHistory');
    errorLogger.error(`Failed to fetch chat history for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Save chat message with error handling
 */
export async function saveChatMessage(
  userId: string,
  content: string,
  role: ChatRole
): Promise<ChatMessageRow> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .insert([
        {
          user_id: userId,
          content,
          role,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as ChatMessageRow;
  } catch (err) {
    const appError = handleSupabaseError(err, 'saveChatMessage');
    errorLogger.error(`Failed to save chat message for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Fetch all categories with error handling
 */
export async function fetchCategories(): Promise<CategoryRow[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    return (data || []) as CategoryRow[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchCategories');
    errorLogger.error('Failed to fetch categories', err);
    throw appError;
  }
}

/**
 * Fetch question by ID with error handling
 */
export async function fetchQuestionById(questionId: string): Promise<Question | null> {
  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return (data || null) as Question | null;
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchQuestionById');
    errorLogger.error(`Failed to fetch question ${questionId}`, err);
    throw appError;
  }
}

/**
 * Fetch exam schedule with error handling
 */
export async function fetchExamSchedule(): Promise<ExamScheduleRow[]> {
  try {
    const { data, error } = await supabase
      .from('exam_schedule')
      .select('*')
      .order('exam_date');

    if (error) throw error;
    return (data || []) as ExamScheduleRow[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchExamSchedule');
    errorLogger.error('Failed to fetch exam schedule', err);
    throw appError;
  }
}

/**
 * Delete practice session with error handling
 */
export async function deletePracticeSession(sessionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('practice_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;
  } catch (err) {
    const appError = handleSupabaseError(err, 'deletePracticeSession');
    errorLogger.error(`Failed to delete practice session ${sessionId}`, err);
    throw appError;
  }
}

/**
 * Get user statistics with error handling
 */
export async function fetchUserStatistics(userId: string): Promise<{
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  totalSessions: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_statistics')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchUserStatistics');
    errorLogger.error(`Failed to fetch statistics for user ${userId}`, err);
    throw appError;
  }
}

/**
 * Batch fetch questions with error handling
 */
export async function fetchQuestionsBatch(questionIds: string[]): Promise<Question[]> {
  if (questionIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds);

    if (error) throw error;
    return (data || []) as Question[];
  } catch (err) {
    const appError = handleSupabaseError(err, 'fetchQuestionsBatch');
    errorLogger.error(`Failed to fetch batch of ${questionIds.length} questions`, err);
    throw appError;
  }
}
