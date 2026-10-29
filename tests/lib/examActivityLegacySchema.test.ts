import { beforeEach, expect, it, vi } from 'vitest';
import { loadExamActivity } from '../../src/lib/examActivity';

const mocks = vi.hoisted(() => ({
  error: null as { code: string; message: string } | null,
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let missingColumn = false;
      const rows = table === 'exam_sessions'
        ? [{ id: 'exam', created_at: '2026-10-16', completed_at: '2026-10-17' }]
        : [{ id: 'answer', exam_session_id: 'exam', is_correct: true }];
      const query = {
        select: (columns: string) => {
          mocks.select(table, columns);
          if (table === 'exam_answers' && columns.includes('answered_at')) missingColumn = true;
          return query;
        },
        order: (column: string) => {
          mocks.order(table, column);
          if (table === 'exam_answers' && column === 'answered_at') missingColumn = true;
          return query;
        },
        eq: () => query,
        in: () => query,
        range: async () => ({
          data: missingColumn || mocks.error ? null : rows,
          error: mocks.error ?? (missingColumn
            ? { code: '42703', message: 'column exam_answers.answered_at does not exist' }
            : null),
        }),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.error = null;
});

it('loads mock history on a database without exam_answers.answered_at', async () => {
  await expect(loadExamActivity('me')).resolves.toEqual([
    { answered_at: '2026-10-17', is_correct: true },
  ]);
  expect(mocks.select).toHaveBeenCalledWith('exam_answers', '*');
  expect(mocks.order).not.toHaveBeenCalledWith('exam_answers', 'answered_at');
});

it('still reports database failures instead of displaying empty history', async () => {
  mocks.error = { code: '42501', message: 'permission denied' };
  await expect(loadExamActivity('me')).rejects.toEqual(mocks.error);
});
