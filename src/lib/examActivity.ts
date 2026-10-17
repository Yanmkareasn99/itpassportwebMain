import { supabase } from './supabase';
import type { DailyActivityAnswer } from './dailyActivity';

/** Reads answer history only from the signed-in user's mock exams. */
export async function loadExamActivity(userId: string): Promise<DailyActivityAnswer[]> {
  const sessionIds: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('exam_sessions').select('id')
      .eq('user_id', userId).order('id').range(offset, offset + 499);
    if (error) throw error;
    sessionIds.push(...(data ?? []).map(session => session.id));
    if (!data || data.length < 500) break;
  }

  const answers: DailyActivityAnswer[] = [];
  for (let batch = 0; batch < sessionIds.length; batch += 50) {
    const ids = sessionIds.slice(batch, batch + 50);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('exam_answers')
        .select('answered_at, is_correct').in('exam_session_id', ids)
        .order('answered_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      answers.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  return answers;
}
