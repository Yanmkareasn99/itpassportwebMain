import { supabase } from './supabase';
import type { DailyActivityAnswer } from './dailyActivity';

/** Reads answer history only from the signed-in user's mock exams. */
export async function loadExamActivity(userId: string): Promise<DailyActivityAnswer[]> {
  const sessions = new Map<string, { completed_at: string | null; created_at: string }>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('exam_sessions').select('id, completed_at, created_at')
      .eq('user_id', userId).order('id').range(offset, offset + 499);
    if (error) throw error;
    for (const session of data ?? []) sessions.set(session.id, session);
    if (!data || data.length < 500) break;
  }

  const sessionIds = [...sessions.keys()];
  const answers: DailyActivityAnswer[] = [];
  for (let batch = 0; batch < sessionIds.length; batch += 50) {
    const ids = sessionIds.slice(batch, batch + 50);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('exam_answers')
        // Older databases may have created_at or no answer timestamp at all.
        // Read available fields and paginate by the stable ID, which always exists.
        .select('*').in('exam_session_id', ids)
        .order('id').range(offset, offset + 499);
      if (error) throw error;
      for (const answer of data ?? []) {
        const session = sessions.get(answer.exam_session_id);
        const answeredAt = answer.answered_at || answer.created_at
          || session?.completed_at || session?.created_at;
        if (answeredAt) answers.push({ answered_at: answeredAt, is_correct: answer.is_correct === true });
      }
      if (!data || data.length < 500) break;
    }
  }
  return answers;
}
