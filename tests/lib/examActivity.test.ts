import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});
import { loadExamActivity } from '../../src/lib/examActivity';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({ profile: { id: 'me' } }));
});

it('loads saved mock answers from their answer dates, including old sessions and more than 500 answers', async () => {
  const answers = Array.from({ length: 501 }, (_, i) => ({
    id: `a${i}`, exam_session_id: 'exam', question_id: `q${i}`,
    answered_at: '2026-10-17T12:00:00+09:00', is_correct: i % 2 === 0,
  }));
  localStorage.setItem('manabi-local-data', JSON.stringify({
    exam_sessions: [
      { id: 'exam', user_id: 'me', created_at: '2026-09-01' },
      { id: 'private', user_id: 'someone-else' },
    ],
    exam_answers: [...answers, { id: 'private', exam_session_id: 'private', is_correct: true }],
  }));
  const result = await loadExamActivity('me');
  expect(result).toHaveLength(501);
  expect(result.every(answer => answer.answered_at === '2026-10-17T12:00:00+09:00')).toBe(true);
  expect(result.filter(answer => answer.is_correct)).toHaveLength(251);
});

it('includes exams beyond the first session batch and page', async () => {
  localStorage.setItem('manabi-local-data', JSON.stringify({
    exam_sessions: Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, user_id: 'me' })),
    exam_answers: [{ id: 'answer', exam_session_id: 's99', answered_at: '2026-10-17', is_correct: true }],
  }));
  expect(await loadExamActivity('me')).toEqual([
    expect.objectContaining({ answered_at: '2026-10-17', is_correct: true }),
  ]);
});

it('returns no activity for an account without exams', async () => {
  expect(await loadExamActivity('me')).toEqual([]);
});
