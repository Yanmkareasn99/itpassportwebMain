import { supabase, isSupabaseEnabled } from './supabase';
import { BattleRoom, PointSetting, ProfilePoints } from '../types';

export const DEFAULT_POINT_SETTINGS: Record<string, number> = {
  daily_login_points: 100,
  practice_correct_points: 50,
  practice_wrong_points: 10,
  mock_correct_points: 50,
  mock_wrong_points: 10,
};

const LOCAL_POINTS_KEY = 'manabi-local-points';
const LOCAL_DAILY_KEY = 'manabi-local-daily-points';

function readLocalNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function localBalanceKey(userId: string) {
  return `${LOCAL_POINTS_KEY}:${userId}`;
}

function localDailyKey(userId: string) {
  return `${LOCAL_DAILY_KEY}:${userId}`;
}

export async function getPointBalance(userId: string): Promise<ProfilePoints> {
  if (!isSupabaseEnabled) {
    return {
      user_id: userId,
      balance: readLocalNumber(localBalanceKey(userId), 0),
      last_daily_awarded_on: localStorage.getItem(localDailyKey(userId)),
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('profile_points')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return (data as ProfilePoints | null) ?? {
    user_id: userId,
    balance: 0,
    last_daily_awarded_on: null,
    updated_at: new Date().toISOString(),
  };
}

export async function claimDailyLoginPoints(userId: string): Promise<ProfilePoints> {
  if (!isSupabaseEnabled) {
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = localDailyKey(userId);
    const balanceKey = localBalanceKey(userId);
    if (localStorage.getItem(dailyKey) !== today) {
      const nextBalance = readLocalNumber(balanceKey, 0) + DEFAULT_POINT_SETTINGS.daily_login_points;
      localStorage.setItem(balanceKey, String(nextBalance));
      localStorage.setItem(dailyKey, today);
    }
    return getPointBalance(userId);
  }

  const { error } = await supabase.rpc('claim_daily_login');
  if (error) throw error;
  return getPointBalance(userId);
}

export async function awardLocalAnswerPoints(userId: string, isCorrect: boolean, mode: 'practice' | 'mock') {
  if (isSupabaseEnabled) return;

  const key = mode === 'practice'
    ? (isCorrect ? 'practice_correct_points' : 'practice_wrong_points')
    : (isCorrect ? 'mock_correct_points' : 'mock_wrong_points');
  const balanceKey = localBalanceKey(userId);
  const nextBalance = readLocalNumber(balanceKey, 0) + DEFAULT_POINT_SETTINGS[key];
  localStorage.setItem(balanceKey, String(nextBalance));
}

export async function fetchPointSettings(): Promise<PointSetting[]> {
  if (!isSupabaseEnabled) {
    return Object.entries(DEFAULT_POINT_SETTINGS).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));
  }

  const { data, error } = await supabase
    .from('point_settings')
    .select('*')
    .order('key');

  if (error) throw error;
  return (data ?? []) as PointSetting[];
}

export async function updatePointSetting(key: string, value: number) {
  if (!isSupabaseEnabled) return;

  const { error } = await supabase
    .from('point_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);

  if (error) throw error;
}

export async function createOnlineBattleRoom(wager: number, questionCount: number, secondsPerQuestion = 30) {
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) throw new Error('Question count must be between 1 and 20.');
  if (!Number.isInteger(secondsPerQuestion) || secondsPerQuestion < 5 || secondsPerQuestion > 300) throw new Error('Time per question must be between 5 and 300 seconds.');
  const { data, error } = await supabase.rpc('create_battle_room', {
    wager,
    question_count: questionCount,
    seconds_per_question: secondsPerQuestion,
  });
  if (error) throw error;
  return data as BattleRoom;
}

export async function joinOnlineBattleRoom(roomId: string) {
  const { data, error } = await supabase.rpc('join_battle_room', {
    target_room_id: roomId,
  });
  if (error) throw error;
  return data as BattleRoom;
}

export async function submitOnlineBattleAnswer(roomId: string, questionId: string, choiceId: string | null) {
  const { data, error } = await supabase.rpc('submit_battle_answer', {
    target_room_id: roomId,
    target_question_id: questionId,
    selected_choice: choiceId,
  });
  if (error) throw error;
  return data as BattleRoom;
}

export async function completeOnlineBattleRoom(roomId: string) {
  const { data, error } = await supabase.rpc('complete_battle_room', {
    target_room_id: roomId,
  });
  if (error) throw error;
  return data as BattleRoom;
}

export async function cancelOnlineBattleRoom(roomId: string) {
  const { data, error } = await supabase.rpc('cancel_battle_room', {
    target_room_id: roomId,
  });
  if (error) throw error;
  return data as BattleRoom;
}
