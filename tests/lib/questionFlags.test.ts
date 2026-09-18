import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});
import { loadFlaggedQuestions, loadQuestionFlags, setQuestionFlag } from '../../src/lib/questionFlags';
import { fetchPracticeQuestions } from '../../src/lib/practice';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({ profile: { id: 'me' } }));
});

describe('question flags', () => {
  it('creates, changes, filters, and removes a private question flag', async () => {
    const [question] = await fetchPracticeQuestions(null, 'all', 'all');

    await setQuestionFlag('me', question.id, 'green');
    await setQuestionFlag('me', question.id, 'red');
    await setQuestionFlag('someone-else', 'q2', 'orange');

    expect(await loadQuestionFlags('me')).toMatchObject([
      { user_id: 'me', question_id: question.id, level: 'red' },
    ]);
    expect(await loadFlaggedQuestions('me', 'green')).toEqual([]);
    expect((await loadFlaggedQuestions('me', 'red')).map(item => item.id)).toEqual([question.id]);

    await setQuestionFlag('me', question.id, null);
    expect(await loadQuestionFlags('me')).toEqual([]);
  });
});
