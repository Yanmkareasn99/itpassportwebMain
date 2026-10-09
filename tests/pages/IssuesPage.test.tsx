import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssuesPage from '../../src/pages/IssuesPage';
import type { BugReport, BugReportComment } from '../../src/types';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'reporter@example.com' } as { id: string; email: string } | null,
  profile: { name: 'Reporter' } as { name: string } | null,
  isAdmin: false,
  loadBugReports: vi.fn(),
  loadBugReportComments: vi.fn(),
  createBugReport: vi.fn(),
  updateBugReportStatus: vi.fn(),
  deleteBugReport: vi.fn(),
  createBugReportComment: vi.fn(),
  updateBugReportComment: vi.fn(),
  deleteBugReportComment: vi.fn(),
}));

vi.mock('../../src/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    profile: mocks.profile,
    isAdmin: mocks.isAdmin,
  }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/lib/bugReports', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/bugReports')>();
  return {
    ...original,
    loadBugReports: mocks.loadBugReports,
    loadBugReportComments: mocks.loadBugReportComments,
    createBugReport: mocks.createBugReport,
    updateBugReportStatus: mocks.updateBugReportStatus,
    deleteBugReport: mocks.deleteBugReport,
    createBugReportComment: mocks.createBugReportComment,
    updateBugReportComment: mocks.updateBugReportComment,
    deleteBugReportComment: mocks.deleteBugReportComment,
  };
});

const report: BugReport = {
  id: 'report-12345678',
  reporter_id: 'user-1',
  reporter_name: 'Reporter',
  title: 'Slow website',
  details: 'The page takes too long to load.',
  status: 'open',
  labels: ['bug', 'performance'],
  created_at: '2026-10-09T01:00:00Z',
  updated_at: '2026-10-09T01:00:00Z',
};

const comment: BugReportComment = {
  id: 'comment-1',
  issue_id: report.id,
  author_id: 'user-1',
  author_name: 'Reporter',
  body: 'This happens on every page.',
  created_at: '2026-10-09T01:05:00Z',
  updated_at: '2026-10-09T01:05:00Z',
};

describe('IssuesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'user-1', email: 'reporter@example.com' };
    mocks.profile = { name: 'Reporter' };
    mocks.isAdmin = false;
    mocks.loadBugReports.mockResolvedValue([report]);
    mocks.loadBugReportComments.mockResolvedValue([comment]);
    mocks.createBugReport.mockImplementation(async input => ({
      ...report,
      id: 'report-new',
      title: input.title,
      details: input.details,
      labels: input.labels,
    }));
    mocks.updateBugReportStatus.mockImplementation(async (_id, status) => ({ ...report, status }));
    mocks.deleteBugReport.mockResolvedValue(undefined);
    mocks.createBugReportComment.mockImplementation(async input => ({
      ...comment,
      id: 'comment-new',
      issue_id: input.issueId,
      body: input.body,
    }));
    mocks.updateBugReportComment.mockImplementation(async (_id, body) => ({ ...comment, body }));
    mocks.deleteBugReportComment.mockResolvedValue(undefined);
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 72,
    });
  });

  it('lets a reporter create, discuss, edit and delete their issue', async () => {
    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);

    expect(await screen.findByText('Slow website')).toBeTruthy();
    expect(screen.getByText('This happens on every page.')).toBeTruthy();

    const commentInput = screen.getByPlaceholderText('Add a comment or update...');
    fireEvent.change(commentInput, { target: { value: 'Additional details' } });
    expect(commentInput.style.height).toBe('72px');
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(mocks.createBugReportComment).toHaveBeenCalledWith({
      issueId: report.id,
      authorId: 'user-1',
      authorName: 'Reporter',
      body: 'Additional details',
    }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Comment options' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    const editInput = screen.getByRole('textbox', { name: 'Edit comment' });
    fireEvent.change(editInput, { target: { value: 'Updated explanation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.updateBugReportComment).toHaveBeenCalledWith(
      comment.id,
      'Updated explanation',
    ));

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'closed' },
    });
    expect(screen.queryByText('Slow website')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'all' },
    });
    expect(screen.getByText('Slow website')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Issue title'), { target: { value: 'Broken navigation' } });
    const detailsInput = screen.getByLabelText('Details');
    fireEvent.change(detailsInput, { target: { value: 'The menu does not open.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    fireEvent.click(screen.getByRole('button', { name: 'UI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit issue' }));
    await waitFor(() => expect(mocks.createBugReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 'user-1',
      reporterName: 'Reporter',
      title: 'Broken navigation',
      details: 'The menu does not open.',
      labels: ['ui'],
    })));
    expect((await screen.findByRole('status')).textContent).toContain('submitted successfully');

    fireEvent.click(screen.getAllByRole('button', { name: 'Comment options' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Comment options' })[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete report: Slow website' }));
    await waitFor(() => expect(mocks.deleteBugReport).toHaveBeenCalledWith(report.id));
    expect(screen.queryByText('Slow website')).toBeNull();
  });

  it('lets an administrator update and delete another reporter’s issue', async () => {
    mocks.isAdmin = true;
    mocks.loadBugReports.mockResolvedValue([{ ...report, reporter_id: 'another-user' }]);
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);
    expect(await screen.findByText('Slow website')).toBeTruthy();

    mocks.updateBugReportStatus.mockRejectedValueOnce('status failed');
    fireEvent.change(screen.getByRole('combobox', { name: 'Change status for Slow website' }), {
      target: { value: 'resolved' },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to update issue status.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Change status for Slow website' }), {
      target: { value: 'closed' },
    });
    await waitFor(() => expect(mocks.updateBugReportStatus).toHaveBeenLastCalledWith(report.id, 'closed'));

    const deleteButton = screen.getByRole('button', { name: 'Delete report: Slow website' });
    fireEvent.click(deleteButton);
    expect(mocks.deleteBugReport).not.toHaveBeenCalled();
    mocks.deleteBugReport.mockRejectedValueOnce(new Error('Delete failed'));
    fireEvent.click(deleteButton);
    expect((await screen.findByRole('alert')).textContent).toContain('Delete failed');
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mocks.deleteBugReport).toHaveBeenCalledWith(report.id));
  });

  it('handles loading and submission failures without breaking the report form', async () => {
    mocks.loadBugReports.mockRejectedValueOnce('load failed');
    mocks.createBugReport.mockRejectedValueOnce('create failed');

    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load issue reports.');

    fireEvent.change(screen.getByLabelText('Issue title'), { target: { value: 'Cannot submit' } });
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Submission fails.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit issue' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unable to submit issue report.'));
  });

  it('deletes a comment while it is being edited', async () => {
    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);
    expect(await screen.findByText('This happens on every page.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(mocks.deleteBugReportComment).toHaveBeenCalledWith(comment.id));
    expect(screen.queryByText('This happens on every page.')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Edit comment' })).toBeNull();
  });

  it('uses email fallbacks and safely renders optional report data', async () => {
    mocks.profile = { name: '' };
    mocks.loadBugReports.mockResolvedValue([{ ...report, labels: null }]);
    mocks.loadBugReportComments.mockResolvedValue([{
      ...comment,
      author_id: 'another-user',
      updated_at: '2026-10-09T01:10:00Z',
    }]);

    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);
    expect(await screen.findByText('Slow website')).toBeTruthy();
    expect(screen.getByText(/edited/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comment options' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Issue title'), { target: { value: 'Email fallback' } });
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Use the account email.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit issue' }));
    await waitFor(() => expect(mocks.createBugReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterName: 'reporter@example.com',
    })));

    const commentInput = screen.getAllByPlaceholderText('Add a comment or update...')[0];
    fireEvent.change(commentInput, { target: { value: 'Email author' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Post comment' })[0]);
    await waitFor(() => expect(mocks.createBugReportComment).toHaveBeenCalledWith(expect.objectContaining({
      authorName: 'reporter@example.com',
    })));
  });

  it('does not query reports without an authenticated user', () => {
    mocks.user = null;
    mocks.profile = null;

    render(<IssuesPage currentPage="issues" onNavigate={vi.fn()} />);

    expect(screen.getByText('Unknown user')).toBeTruthy();
    expect(mocks.loadBugReports).not.toHaveBeenCalled();
  });
});
