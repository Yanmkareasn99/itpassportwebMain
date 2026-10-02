import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});

import {
  createBugReport,
  createBugReportComment,
  loadBugReportComments,
  loadBugReports,
  updateBugReportStatus,
} from '../../src/lib/bugReports';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi-local-auth', JSON.stringify({
    email: 'reporter@example.com',
    profile: { id: 'reporter', name: 'Test Reporter', is_admin: true },
  }));
});

describe('bug reports', () => {
  it('creates a report with its reporter, details, labels, and open status', async () => {
    const report = await createBugReport({
      reporterId: 'reporter',
      reporterName: 'Test Reporter',
      title: 'Practice button does not start',
      details: 'Select an exam year and press the practice button.',
      labels: ['bug', 'ui'],
    });

    expect(report).toMatchObject({
      reporter_id: 'reporter',
      reporter_name: 'Test Reporter',
      title: 'Practice button does not start',
      status: 'open',
      labels: ['bug', 'ui'],
    });
    expect(report.created_at).toBeTruthy();
    expect(report.updated_at).toBeTruthy();
  });

  it('limits a regular user to their reports and lets an administrator update status', async () => {
    localStorage.setItem('manabi-local-data', JSON.stringify({
      bug_reports: [
        { id: 'own', reporter_id: 'reporter', reporter_name: 'Test Reporter', title: 'Own', details: 'Details', labels: [], status: 'open', created_at: '2026-10-01', updated_at: '2026-10-01' },
        { id: 'other', reporter_id: 'other-user', reporter_name: 'Other User', title: 'Other', details: 'Details', labels: ['content'], status: 'in_progress', created_at: '2026-10-02', updated_at: '2026-10-02' },
      ],
    }));

    expect((await loadBugReports('reporter', false)).map(report => report.id)).toEqual(['own']);
    expect((await loadBugReports('reporter', true)).map(report => report.id)).toEqual(['other', 'own']);

    const updated = await updateBugReportStatus('own', 'resolved');
    expect(updated.status).toBe('resolved');
    expect((await loadBugReports('reporter', false))[0].status).toBe('resolved');
  });

  it('stores and loads comments with their author for selected issues', async () => {
    const report = await createBugReport({
      reporterId: 'reporter',
      reporterName: 'Test Reporter',
      title: 'Question image is missing',
      details: 'The question loads without its diagram.',
      labels: ['content'],
    });
    const comment = await createBugReportComment({
      issueId: report.id,
      authorId: 'reporter',
      authorName: 'Test Reporter',
      body: 'This happens on the practice page.',
    });

    expect(comment).toMatchObject({
      issue_id: report.id,
      author_id: 'reporter',
      author_name: 'Test Reporter',
      body: 'This happens on the practice page.',
    });
    expect(await loadBugReportComments([report.id])).toEqual([comment]);
    expect(await loadBugReportComments([])).toEqual([]);
  });
});
