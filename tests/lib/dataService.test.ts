import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../src/lib/supabase';
import {
  deletePracticeSession,
  fetchCategories,
  fetchChatHistory,
  fetchExamResults,
  fetchExamSchedule,
  fetchPracticeSessions,
  fetchQuestionById,
  fetchQuestionsBatch,
  fetchQuestionsByCategory,
  fetchUserProfile,
  fetchUserStatistics,
  saveAnswer,
  saveChatMessage,
  updateUserProfile,
} from '../../src/lib/dataService';

type QueryResult = { data?: unknown; error?: unknown };

function createQuery(result: QueryResult) {
  const query: Record<string, ReturnType<typeof vi.fn>> & {
    then?: PromiseLike<QueryResult>['then'];
  } = {};

  for (const method of ['select', 'eq', 'limit', 'order', 'insert', 'update', 'delete', 'single', 'in']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

const fromMock = vi.mocked(supabase.from);

function mockQueryResult(result: QueryResult) {
  const query = createQuery(result);
  fromMock.mockReturnValue(query as never);
  return query;
}

describe('dataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('fetches questions by category using the requested limit', async () => {
    const rows = [{ id: 'question-1' }];
    const query = mockQueryResult({ data: rows, error: null });

    await expect(fetchQuestionsByCategory('strategy', 12)).resolves.toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith('questions');
    expect(query.eq).toHaveBeenCalledWith('category_id', 'strategy');
    expect(query.limit).toHaveBeenCalledWith(12);
  });

  it('uses empty arrays when list queries return no rows', async () => {
    mockQueryResult({ data: null, error: null });
    await expect(fetchQuestionsByCategory('management')).resolves.toEqual([]);

    mockQueryResult({ data: null, error: null });
    await expect(fetchPracticeSessions('user-1')).resolves.toEqual([]);

    mockQueryResult({ data: null, error: null });
    await expect(fetchExamResults('user-1')).resolves.toEqual([]);

    mockQueryResult({ data: null, error: null });
    await expect(fetchChatHistory('user-1')).resolves.toEqual([]);

    mockQueryResult({ data: null, error: null });
    await expect(fetchCategories()).resolves.toEqual([]);

    mockQueryResult({ data: null, error: null });
    await expect(fetchExamSchedule()).resolves.toEqual([]);
  });

  it('fetches profile, session, result, history, category, schedule and statistics rows', async () => {
    const cases: Array<[() => Promise<unknown>, unknown]> = [
      [() => fetchUserProfile('user-1'), { id: 'user-1', name: 'Student' }],
      [() => fetchPracticeSessions('user-1', 5), [{ id: 'session-1' }]],
      [() => fetchExamResults('user-1', 7), [{ id: 'exam-1' }]],
      [() => fetchChatHistory('user-1', 9), [{ id: 'message-1' }]],
      [() => fetchCategories(), [{ id: 'category-1' }]],
      [() => fetchExamSchedule(), [{ id: 'schedule-1' }]],
      [() => fetchUserStatistics('user-1'), { totalQuestions: 10, correctAnswers: 8 }],
    ];

    for (const [operation, data] of cases) {
      mockQueryResult({ data, error: null });
      await expect(operation()).resolves.toEqual(data);
    }
  });

  it('returns null when a single row is absent', async () => {
    mockQueryResult({ data: null, error: { code: 'PGRST116' } });
    await expect(fetchUserProfile('missing-user')).resolves.toBeNull();

    mockQueryResult({ data: null, error: { code: 'PGRST116' } });
    await expect(fetchQuestionById('missing-question')).resolves.toBeNull();

    mockQueryResult({ data: null, error: { code: 'PGRST116' } });
    await expect(fetchUserStatistics('missing-user')).resolves.toBeNull();
  });

  it('saves answers, profile updates and chat messages', async () => {
    const savedAnswer = { id: 'answer-1' };
    const answerQuery = mockQueryResult({ data: savedAnswer, error: null });
    await expect(saveAnswer('user-1', 'question-1', 2, true)).resolves.toEqual(savedAnswer);
    expect(answerQuery.insert).toHaveBeenCalledWith([{
      user_id: 'user-1',
      question_id: 'question-1',
      selected_answer: 2,
      is_correct: true,
    }]);

    const profile = { id: 'user-1', name: 'Updated' };
    const profileQuery = mockQueryResult({ data: profile, error: null });
    await expect(updateUserProfile('user-1', { name: 'Updated' })).resolves.toEqual(profile);
    expect(profileQuery.update).toHaveBeenCalledWith({ name: 'Updated' });

    const message = { id: 'message-1', user_id: 'user-1', content: 'Hello', role: 'user' };
    const messageQuery = mockQueryResult({ data: message, error: null });
    await expect(saveChatMessage('user-1', 'Hello', 'user')).resolves.toEqual(message);
    expect(messageQuery.insert).toHaveBeenCalledWith([{
      user_id: 'user-1',
      content: 'Hello',
      role: 'user',
    }]);
  });

  it('fetches a question and batches question identifiers', async () => {
    const question = { id: 'question-1' };
    mockQueryResult({ data: question, error: null });
    await expect(fetchQuestionById('question-1')).resolves.toEqual(question);

    const rows = [{ id: 'question-1' }, { id: 'question-2' }];
    const query = mockQueryResult({ data: rows, error: null });
    await expect(fetchQuestionsBatch(['question-1', 'question-2'])).resolves.toEqual(rows);
    expect(query.in).toHaveBeenCalledWith('id', ['question-1', 'question-2']);
  });

  it('skips Supabase when a question batch is empty', async () => {
    await expect(fetchQuestionsBatch([])).resolves.toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('deletes a practice session', async () => {
    const query = mockQueryResult({ error: null });
    await expect(deletePracticeSession('session-1')).resolves.toBeUndefined();
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith('id', 'session-1');
  });

  it('normalizes failures from every Supabase operation', async () => {
    const failure = { code: 'PGRST301', message: 'database unavailable' };
    const operations: Array<() => Promise<unknown>> = [
      () => fetchQuestionsByCategory('strategy'),
      () => fetchUserProfile('user-1'),
      () => fetchPracticeSessions('user-1'),
      () => fetchExamResults('user-1'),
      () => saveAnswer('user-1', 'question-1', 0, false),
      () => updateUserProfile('user-1', { name: 'Student' }),
      () => fetchChatHistory('user-1'),
      () => saveChatMessage('user-1', 'Hello', 'assistant'),
      () => fetchCategories(),
      () => fetchQuestionById('question-1'),
      () => fetchExamSchedule(),
      () => deletePracticeSession('session-1'),
      () => fetchUserStatistics('user-1'),
      () => fetchQuestionsBatch(['question-1']),
    ];

    for (const operation of operations) {
      mockQueryResult({ data: null, error: failure });
      await expect(operation()).rejects.toMatchObject({
        message: expect.any(String),
      });
    }
  });
});
