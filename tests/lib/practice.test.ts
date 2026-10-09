import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});
import { supabase } from '../../src/lib/supabase';
import { createPracticeSession, fetchPracticeQuestions, invalidatePracticeQuestionCache, loadExamDates, loadLatestAnswerStatus, loadPracticeSession, loadPracticeProgress, loadQuestionCatalog, loadQuestionsByIds, practiceErrorMessage, preloadQuestionCatalog } from '../../src/lib/practice';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({ profile: { id: 'me' } }));
});

describe('practice data', () => {
  it('reuses one page-lifetime catalog for background preloading, filters, and ID lookups', async () => {
    invalidatePracticeQuestionCache();
    const fromSpy = vi.spyOn(supabase, 'from');

    await preloadQuestionCatalog();
    const catalog = await loadQuestionCatalog();
    const questionQueriesAfterPreload = fromSpy.mock.calls.filter(([table]) => table === 'questions').length;
    const selected = await loadQuestionsByIds([catalog[1].id, catalog[0].id, catalog[1].id]);
    await fetchPracticeQuestions(null, 'all', 'all');

    expect(selected.map(question => question.id)).toEqual([catalog[1].id, catalog[0].id, catalog[1].id]);
    expect(fromSpy.mock.calls.filter(([table]) => table === 'questions')).toHaveLength(questionQueriesAfterPreload);
    expect(await loadQuestionsByIds([])).toEqual([]);
    fromSpy.mockRestore();
  });

  it('restores the same questions and answers from a saved session without creating another session', async () => {
    const fromSpy = vi.spyOn(supabase, 'from');
    const questions = (await fetchPracticeQuestions(null, 'all', 'all')).slice(0, 3).reverse();
    const id = await createPracticeSession('me', 'all', questions);
    await supabase.from('session_answers').insert({ session_id: id, question_id: questions[0].id, selected_choice_id: 'choice', is_correct: true });
    const callsBeforeRestore = fromSpy.mock.calls.length;
    const restored = await loadPracticeSession('me', id);
    expect(restored.questions.map(question => question.id)).toEqual(questions.map(question => question.id));
    expect(restored.answers).toEqual([{ questionId: questions[0].id, choiceId: 'choice', isCorrect: true }]);
    expect(restored.finished).toBe(false);
    expect(fromSpy.mock.calls.slice(callsBeforeRestore).some(([table]) => table === 'questions')).toBe(false);

    invalidatePracticeQuestionCache();
    const callsBeforeUncachedRestore = fromSpy.mock.calls.length;
    const uncachedRestore = await loadPracticeSession('me', id);
    expect(uncachedRestore.questions.map(question => question.id)).toEqual(questions.map(question => question.id));
    expect(fromSpy.mock.calls.slice(callsBeforeUncachedRestore).some(([table]) => table === 'questions')).toBe(true);

    const sessions = await supabase.from('practice_sessions').select('*');
    expect(sessions.data).toHaveLength(1);
    await expect(loadPracticeSession('someone-else', id)).rejects.toThrow();
    fromSpy.mockRestore();
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

  it('bounds the short-lived cache used when starting several practice sessions', async () => {
    invalidatePracticeQuestionCache();
    const questions = (await fetchPracticeQuestions(null, 'all', 'all')).slice(0, 1);
    const sessionIds = [];
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    for (let index = 0; index < 4; index += 1) {
      sessionIds.push(await createPracticeSession('me', 'all', questions));
    }
    dateNow.mockReturnValue(now + 11 * 60 * 1000);
    sessionIds.push(await createPracticeSession('me', 'all', questions));
    dateNow.mockRestore();

    expect(new Set(sessionIds).size).toBe(5);
    const restored = await loadPracticeSession('me', sessionIds[4]);
    expect(restored.questions.map(question => question.id)).toEqual([questions[0].id]);
  });

  it.each(['2025-04', '2024-04', '2023-04'] as const)('combines the %s exam period with question type and subject filters', async examDate => {
    const all = await fetchPracticeQuestions(null, 'all', 'all');
    const subject = all[0].subject_id;
    const actual = await fetchPracticeQuestions([subject], examDate, 'multiple_choice');
    const expected = all.filter(q => q.subject_id === subject && `${q.exam_year}-${String(q.exam_month).padStart(2, '0')}` === examDate && q.question_type === 'multiple_choice');
    expect(actual.map(q => q.id).sort()).toEqual(expected.map(q => q.id).sort());
  });

  it('combines multiple selected subjects with multiple selected exam periods', async () => {
    const all = await fetchPracticeQuestions(null, 'all', 'all');
    const subjects = [...new Set(all.map(question => question.subject_id))].slice(0, 2);
    const examDates = ['2025-04', '2024-04'];
    const actual = await fetchPracticeQuestions(subjects, examDates, 'all');
    const expected = all.filter(question =>
      subjects.includes(question.subject_id)
      && examDates.includes(`${question.exam_year}-${String(question.exam_month).padStart(2, '0')}`),
    );

    expect(actual.length).toBeGreaterThan(0);
    expect(actual.map(question => question.id).sort()).toEqual(
      expected.map(question => question.id).sort(),
    );
  });

  it('lists each available exam period newest first', async () => {
    expect(await loadExamDates()).toEqual(['2025-04', '2024-04', '2023-04', 'uncategorized']);
  });

  it('filters questions without an exam year as uncategorized', async () => {
    const questions = await fetchPracticeQuestions(null, 'uncategorized', 'all');
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every(question => question.exam_year === null)).toBe(true);
  });

  it('handles a filter with no matching questions', async () => {
    expect(await fetchPracticeQuestions(['missing-subject'], '2025-04', 'tree')).toEqual([]);
  });

  it('retains plain-object Supabase error messages', () => {
    expect(practiceErrorMessage({ message: 'permission denied for table session_answers' }, 'Unable to start practice.'))
      .toBe('permission denied for table session_answers');
    expect(practiceErrorMessage(null, 'Unable to start practice.')).toBe('Unable to start practice.');
    expect(practiceErrorMessage({ message: 503 }, 'Unable to start practice.')).toBe('Unable to start practice.');
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
