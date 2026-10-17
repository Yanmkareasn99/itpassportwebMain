import { supabase } from './supabase';
import type { DailyActivityAnswer } from './dailyActivity';

export async function loadBattleActivity(userId: string): Promise<DailyActivityAnswer[]> {
  const answers: DailyActivityAnswer[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('battle_answers')
      .select('answered_at, is_correct').eq('user_id', userId)
      .order('answered_at').order('id').range(offset, offset + 499);
    if (error) throw error;
    answers.push(...(data ?? []));
    if (!data || data.length < 500) return answers;
  }
}
