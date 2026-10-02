import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Bug, CheckCircle2, Clock3, MessageCircle, Plus, Send, Tag, UserRound } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translate, translateMessage } from '../i18n';
import {
  BUG_REPORT_LABELS,
  BUG_REPORT_STATUSES,
  createBugReport,
  createBugReportComment,
  loadBugReportComments,
  loadBugReports,
  updateBugReportStatus,
} from '../lib/bugReports';
import type { BugReport, BugReportComment, BugReportLabel, BugReportStatus, Page } from '../types';

interface IssuesPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

function statusText(language: 'ja' | 'en' | 'vi', status: BugReportStatus) {
  if (status === 'in_progress') return translate(language, 'issuesPage.statusInProgress');
  if (status === 'resolved') return translate(language, 'issuesPage.statusResolved');
  if (status === 'closed') return translate(language, 'issuesPage.statusClosed');
  return translate(language, 'issuesPage.statusOpen');
}

function labelText(language: 'ja' | 'en' | 'vi', label: BugReportLabel) {
  if (label === 'ui') return translate(language, 'issuesPage.labelUi');
  if (label === 'content') return translate(language, 'issuesPage.labelContent');
  if (label === 'performance') return translate(language, 'issuesPage.labelPerformance');
  if (label === 'accessibility') return translate(language, 'issuesPage.labelAccessibility');
  if (label === 'other') return translate(language, 'issuesPage.labelOther');
  return translate(language, 'issuesPage.labelBug');
}

const statusStyles: Record<BugReportStatus, string> = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  resolved: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  closed: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const labelStyles: Record<BugReportLabel, string> = {
  bug: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  ui: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-300',
  content: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  performance: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  accessibility: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  other: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function IssuesPage({ currentPage, onNavigate }: IssuesPageProps) {
  const { user, profile, isAdmin } = useAuth();
  const { language } = useLanguage();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [comments, setComments] = useState<BugReportComment[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [labels, setLabels] = useState<BugReportLabel[]>(['bug']);
  const [statusFilter, setStatusFilter] = useState<'all' | BugReportStatus>('all');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    loadBugReports(user.id, isAdmin)
      .then(async data => {
        const loadedComments = await loadBugReportComments(data.map(report => report.id));
        if (!cancelled) {
          setReports(data);
          setComments(loadedComments);
        }
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load issue reports.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  function toggleLabel(label: BugReportLabel) {
    setLabels(current => current.includes(label)
      ? current.filter(value => value !== label)
      : [...current, label]);
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!user || !profile || submitting || !title.trim() || !details.trim()) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const report = await createBugReport({
        reporterId: user.id,
        reporterName: profile.name || user.email || translate(language, 'issuesPage.unknownUser'),
        title,
        details,
        labels,
      });
      setReports(current => [report, ...current]);
      setTitle('');
      setDetails('');
      setLabels(['bug']);
      setSuccess(translate(language, 'issuesPage.reportSubmitted'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit issue report.');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(reportId: string, status: BugReportStatus) {
    if (!isAdmin || savingStatus) return;
    setSavingStatus(reportId);
    setError('');
    try {
      const updated = await updateBugReportStatus(reportId, status);
      setReports(current => current.map(report => report.id === reportId ? updated : report));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update issue status.');
    } finally {
      setSavingStatus(null);
    }
  }

  async function submitComment(event: FormEvent, issueId: string) {
    event.preventDefault();
    const body = commentDrafts[issueId]?.trim();
    if (!user || !profile || !body || submittingComment) return;
    setSubmittingComment(issueId);
    setError('');
    try {
      const comment = await createBugReportComment({
        issueId,
        authorId: user.id,
        authorName: profile.name || user.email || translate(language, 'issuesPage.unknownUser'),
        body,
      });
      setComments(current => [...current, comment]);
      setCommentDrafts(current => ({ ...current, [issueId]: '' }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : 'Unable to submit comment.');
    } finally {
      setSubmittingComment(null);
    }
  }

  const visibleReports = statusFilter === 'all'
    ? reports
    : reports.filter(report => report.status === statusFilter);

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(language, 'issuesPage.title')}
      subtitle={translate(language, isAdmin ? 'issuesPage.adminSubtitle' : 'issuesPage.subtitle')}
    >
      <div className="app-shell space-y-6">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← {translate(language, 'issuesPage.backToSettings')}
        </button>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {translateMessage(language, error)}
          </div>
        )}
        {success && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <form onSubmit={submitReport} className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <Bug className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{translate(language, 'issuesPage.newIssue')}</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">{translate(language, 'issuesPage.newIssueHelp')}</p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                {translate(language, 'issuesPage.reporter')}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <UserRound className="h-4 w-4 text-gray-400" />
                {profile?.name || user?.email || translate(language, 'issuesPage.unknownUser')}
              </div>
            </div>

            <div>
              <label htmlFor="issue-title" className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                {translate(language, 'issuesPage.issueTitle')}
              </label>
              <input
                id="issue-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={160}
                required
                placeholder={translate(language, 'issuesPage.titlePlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
              />
              <p className="mt-1 text-right text-xs text-gray-400">{title.length}/160</p>
            </div>

            <div>
              <label htmlFor="issue-details" className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                {translate(language, 'issuesPage.details')}
              </label>
              <textarea
                id="issue-details"
                value={details}
                onChange={event => setDetails(event.target.value)}
                maxLength={10000}
                required
                rows={8}
                placeholder={translate(language, 'issuesPage.detailsPlaceholder')}
                className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
              />
            </div>

            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-slate-200">
                <Tag className="h-4 w-4" /> {translate(language, 'issuesPage.labels')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {BUG_REPORT_LABELS.map(label => {
                  const selected = labels.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleLabel(label)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? labelStyles[label] : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}
                    >
                      {labelText(language, label)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={submitting || !title.trim() || !details.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {submitting ? translate(language, 'issuesPage.submitting') : translate(language, 'issuesPage.submitIssue')}
            </button>
          </form>

          <section className="min-w-0 space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">
                  {translate(language, isAdmin ? 'issuesPage.allIssues' : 'issuesPage.yourIssues')}
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {translate(language, 'issuesPage.issueCount', { count: reports.length })}
                </p>
              </div>
              <select
                aria-label={translate(language, 'issuesPage.filterStatus')}
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value as 'all' | BugReportStatus)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">{translate(language, 'issuesPage.allStatuses')}</option>
                {BUG_REPORT_STATUSES.map(status => <option key={status} value={status}>{statusText(language, status)}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(value => <div key={value} className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-slate-800" />)}
              </div>
            ) : visibleReports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <Bug className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-slate-600" />
                <p className="font-semibold text-gray-700 dark:text-slate-200">{translate(language, 'issuesPage.noIssues')}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{translate(language, 'issuesPage.noIssuesHelp')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleReports.map(report => (
                  <article key={report.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[report.status]}`}>
                            {statusText(language, report.status)}
                          </span>
                          {(report.labels ?? []).map(label => (
                            <span key={label} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${labelStyles[label]}`}>
                              {labelText(language, label)}
                            </span>
                          ))}
                        </div>
                        <h3 className="break-words font-bold text-gray-900 dark:text-white">{report.title}</h3>
                      </div>
                      {isAdmin && (
                        <select
                          aria-label={translate(language, 'issuesPage.changeStatus', { title: report.title })}
                          value={report.status}
                          disabled={savingStatus === report.id}
                          onChange={event => void changeStatus(report.id, event.target.value as BugReportStatus)}
                          className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {BUG_REPORT_STATUSES.map(status => <option key={status} value={status}>{statusText(language, status)}</option>)}
                        </select>
                      )}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600 dark:text-slate-300">{report.details}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-slate-800 dark:text-slate-500">
                      <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{report.reporter_name}</span>
                      <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{new Date(report.created_at).toLocaleString(language)}</span>
                      <span>#{report.id.slice(0, 8)}</span>
                    </div>

                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-slate-200">
                        <MessageCircle className="h-4 w-4" />
                        {translate(language, 'issuesPage.comments')}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                          {comments.filter(comment => comment.issue_id === report.id).length}
                        </span>
                      </h4>

                      <div className="space-y-2">
                        {comments.filter(comment => comment.issue_id === report.id).map(comment => (
                          <div key={comment.id} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-slate-800/70">
                            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
                              <span className="font-bold text-gray-700 dark:text-slate-200">{comment.author_name}</span>
                              {comment.author_id === report.reporter_id && (
                                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                  {translate(language, 'issuesPage.reporterBadge')}
                                </span>
                              )}
                              <span className="text-gray-400 dark:text-slate-500">{new Date(comment.created_at).toLocaleString(language)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600 dark:text-slate-300">{comment.body}</p>
                          </div>
                        ))}
                      </div>

                      <form onSubmit={event => void submitComment(event, report.id)} className="mt-3 flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`comment-${report.id}`} className="sr-only">{translate(language, 'issuesPage.addComment')}</label>
                          <textarea
                            id={`comment-${report.id}`}
                            value={commentDrafts[report.id] ?? ''}
                            onChange={event => setCommentDrafts(current => ({ ...current, [report.id]: event.target.value }))}
                            maxLength={5000}
                            rows={2}
                            required
                            placeholder={translate(language, 'issuesPage.commentPlaceholder')}
                            className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
                          />
                        </div>
                        <button
                          type="submit"
                          aria-label={translate(language, 'issuesPage.postComment')}
                          disabled={submittingComment === report.id || !(commentDrafts[report.id]?.trim())}
                          className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
