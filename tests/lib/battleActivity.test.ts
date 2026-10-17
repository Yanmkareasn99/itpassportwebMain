import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});
import { loadBattleActivity } from '../../src/lib/battleActivity';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({ profile: { id: 'me' } }));
});

it('loads every page of the user’s battle answers without counting their opponent', async () => {
  const answers = Array.from({ length: 501 }, (_, i) => ({
    id: `a${i}`, room_id: 'shared-room', user_id: 'me', question_id: `q${i}`,
    answered_at: '2026-10-17T12:00:00+09:00', is_correct: i % 2 === 0,
    selected_choice_id: i % 2 === 0 ? 'choice' : null,
  }));
  localStorage.setItem('manabi-local-data', JSON.stringify({
    battle_answers: [...answers, {
      id: 'opponent-answer', room_id: 'shared-room', user_id: 'opponent',
      answered_at: '2026-10-17T12:00:00+09:00', is_correct: true,
    }],
  }));
  const result = await loadBattleActivity('me');
  expect(result).toHaveLength(501);
  expect(result.every(answer => answer.answered_at === '2026-10-17T12:00:00+09:00')).toBe(true);
  expect(result.filter(answer => answer.is_correct)).toHaveLength(251);
});

it('returns no activity when the user has no saved battle answers', async () => {
  expect(await loadBattleActivity('me')).toEqual([]);
});
