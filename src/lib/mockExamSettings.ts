import { isSupabaseEnabled, supabase } from './supabase';

export interface MockExamSettings {
  question_count: number;
  duration_minutes: number;
  passing_score_percent: number;
}

export const DEFAULT_MOCK_EXAM_SETTINGS: MockExamSettings = {
  question_count: 8,
  duration_minutes: 90,
  passing_score_percent: 70,
};

export function validateMockExamSettings(settings: MockExamSettings) {
  const limits = [
    ['Question count', settings.question_count, 1, 1000],
    ['Time limit', settings.duration_minutes, 1, 1440],
    ['Passing score', settings.passing_score_percent, 0, 100],
  ] as const;
  for (const [label, value, min, max] of limits) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label} must be a whole number between ${min} and ${max}.`);
    }
  }
}

export async function fetchMockExamSettings(): Promise<MockExamSettings> {
  const { data, error } = await supabase.from('mock_exam_settings')
    .select('question_count, duration_minutes, passing_score_percent').eq('id', true).maybeSingle();
  if (error) throw error;
  if (!data && isSupabaseEnabled) throw new Error('Mock exam settings are unavailable. Ask an administrator to apply the mock exam settings migration.');
  const settings = (data ?? DEFAULT_MOCK_EXAM_SETTINGS) as MockExamSettings;
  validateMockExamSettings(settings);
  return settings;
}

export async function saveMockExamSettings(settings: MockExamSettings): Promise<MockExamSettings> {
  validateMockExamSettings(settings);
  const query = isSupabaseEnabled
    ? supabase.from('mock_exam_settings').update(settings).eq('id', true)
    : supabase.from('mock_exam_settings').upsert({ id: true, ...settings });
  const { data, error } = await query.select('question_count, duration_minutes, passing_score_percent').single();
  if (error) throw error;
  if (!data) throw new Error('Settings could not be saved. Administrator access is required.');
  return data as MockExamSettings;
}

export function hasPassedMockExam(correct: number, total: number, passingScore: number) {
  return total > 0 && correct * 100 >= passingScore * total;
}
