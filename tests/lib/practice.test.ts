import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});
import { supabase } from '../../src/lib/supabase';
import { createPracticeSession, fetchPracticeQuestions, loadLatestAnswerStatus, loadPracticeSession, loadPracticeProgress, practiceErrorMessage } from '../../src/lib/practice';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({ profile: { id: 'me' } }));
});

describe('practice data', () => {
  it('restores the same questions and answers from a saved session without creating another session', async () => {
    const questions = (await fetchPracticeQuestions(null, 'all', 'all')).slice(0, 3).reverse();
    const id = await createPracticeSession('me', 'all', questions);
    await supabase.from('session_answers').insert({ session_id: id, question_id: questions[0].id, selected_choice_id: 'choice', is_correct: true });
    const restored = await loadPracticeSession('me', id);
    expect(restored.questions.map(question => question.id)).toEqual(questions.map(question => question.id));
    expect(restored.answers).toEqual([{ questionId: questions[0].id, choiceId: 'choice', isCorrect: true }]);
    expect(restored.finished).toBe(false);
    const sessions = await supabase.from('practice_sessions').select('*');
    expect(sessions.data).toHaveLength(1);
    await expect(loadPracticeSession('someone-else', id)).rejects.toThrow();
  });

  it('only reads current-user history and keeps the newest answer across session batches', async () => {
    const sessions = Array.from({ length: 51 }, (_, i) => ({ id: `s${i}`, user_id: 'me' }));
    localStorage.setItem('manabi-local-data', JSON.stringify({
      practice_sessions: [...sessions, { id: 'other', user_id: 'someone-else' }],
      session_answers: [
        { id: 'a', session_id: 's0', question_id: 'q', is_correct: true, answered_at: '2026-09-10' },
        { id: 'b', session_id: 's50', question_id: 'q', is_correct: false, answered_at: '2026-09-09' },
        { id: 'c', session_id: 'other', question_id: 'private', is_correct: false, answered_at: '2026-09-11' },
      ],
    }));
    expect([...await loadLatestAnswerStatus('me')]).toEqual([['q', true]]);
  });

  it.each(['easy', 'medium', 'hard'] as const)('combines %s difficulty with question type and subject filters', async difficulty => {
    const all = await fetchPracticeQuestions(null, 'all', 'all');
    const subject = all[0].subject_id;
    const actual = await fetchPracticeQuestions([subject], difficulty, 'multiple_choice');
    const levels = difficulty === 'easy' ? [1] : difficulty === 'medium' ? [2, 3] : [4, 5];
    const expected = all.filter(q => q.subject_id === subject && levels.includes(q.difficulty) && q.question_type === 'multiple_choice');
    expect(actual.map(q => q.id).sort()).toEqual(expected.map(q => q.id).sort());
  });

  it('handles a filter with no matching questions', async () => {
    expect(await fetchPracticeQuestions(['missing-subject'], 'hard', 'tree')).toEqual([]);
  });

  it('retains plain-object Supabase error messages', () => {
    expect(practiceErrorMessage({ message: 'permission denied for table session_answers' }, 'Unable to start practice.'))
      .toBe('permission denied for table session_answers');
  });
});

it('calculates progress from saved answers, including unfinished and older sessions', async () => {
  const sessions = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, user_id: 'me', total_questions: 100, correct_answers: 0, completed_at: null, created_at: `2026-09-${String(i + 1).padStart(2, '0')}` }));
  localStorage.setItem('manabi-local-data', JSON.stringify({
    practice_sessions: sessions,
    session_answers: [
      { id: 'a', session_id: 's0', question_id: 'q1', is_correct: true, answered_at: '2026-09-01' },
      { id: 'b', session_id: 's24', question_id: 'q1', is_correct: false, answered_at: '2026-09-25' },
      { id: 'c', session_id: 's24', question_id: 'q2', is_correct: true, answered_at: '2026-09-25' },
    ],
  }));
  const progress = await loadPracticeProgress('me');
  expect(progress).toHaveLength(25);
  expect(progress[0].id).toBe('s24');
  expect(progress.reduce((sum, session) => sum + session.answered_count, 0)).toBe(3);
  expect(progress.reduce((sum, session) => sum + session.correct_answers, 0)).toBe(2);
  await supabase.from('session_answers').insert({ session_id: 's24', question_id: 'q3', is_correct: true });
  const updated = await loadPracticeProgress('me');
  expect(updated.reduce((sum, session) => sum + session.answered_count, 0)).toBe(4);
  expect(updated.reduce((sum, session) => sum + session.correct_answers, 0)).toBe(3);
});
