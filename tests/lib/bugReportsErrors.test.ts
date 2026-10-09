import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { result: { data: unknown; error: Error | null } } = {
    result: { data: null, error: null },
  };
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'in']) {
    query[method] = vi.fn(() => query);
  }
  query.delete = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve(state.result)),
  }));
  query.order = vi.fn(() => Promise.resolve(state.result));
  query.single = vi.fn(() => Promise.resolve(state.result));
  return { state, query, from: vi.fn(() => query) };
});

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import {
  createBugReport,
  createBugReportComment,
  deleteBugReport,
  deleteBugReportComment,
  loadBugReportComments,
  loadBugReports,
  updateBugReportComment,
  updateBugReportStatus,
} from '../../src/lib/bugReports';

beforeEach(() => {
  mocks.state.result = { data: null, error: null };
  vi.clearAllMocks();
});

describe('bug report database failures', () => {
  it('returns empty lists when Supabase returns no rows', async () => {
    await expect(loadBugReports('user', true)).resolves.toEqual([]);
    await expect(loadBugReportComments(['issue'])).resolves.toEqual([]);
  });

  it('propagates report, status, and comment errors', async () => {
    const databaseError = new Error('database unavailable');
    mocks.state.result = { data: null, error: databaseError };

    await expect(loadBugReports('user', true)).rejects.toBe(databaseError);
    await expect(createBugReport({
      reporterId: 'user',
      reporterName: 'User',
      title: 'Title',
      details: 'Details',
      labels: ['bug'],
    })).rejects.toBe(databaseError);
    await expect(updateBugReportStatus('issue', 'closed')).rejects.toBe(databaseError);
    await expect(deleteBugReport('issue')).rejects.toBe(databaseError);
    await expect(loadBugReportComments(['issue'])).rejects.toBe(databaseError);
    await expect(createBugReportComment({
      issueId: 'issue',
      authorId: 'user',
      authorName: 'User',
      body: 'Comment',
    })).rejects.toBe(databaseError);
    await expect(updateBugReportComment('comment', 'Updated comment')).rejects.toBe(databaseError);
    await expect(deleteBugReportComment('comment')).rejects.toBe(databaseError);
  });
});
