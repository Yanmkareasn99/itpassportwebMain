import { supabase } from './supabase';

export interface BattleRankingRow {
  ranking_position: number;
  user_id: string;
  name: string;
  win_count: number;
  correct_answer_count: number;
}

export async function fetchBattleRankings(limit = 50): Promise<BattleRankingRow[]> {
  const { data, error } = await supabase.rpc('get_battle_rankings', {
    ranking_limit: limit,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.message?.includes('get_battle_rankings')) {
      throw new Error('Battle rankings are unavailable. Ask an administrator to apply the battle ranking migration.');
    }
    throw error;
  }
  return (data ?? []) as BattleRankingRow[];
}
