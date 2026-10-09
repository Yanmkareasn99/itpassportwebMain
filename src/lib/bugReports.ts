import { supabase } from './supabase';
import type { BugReport, BugReportComment, BugReportLabel, BugReportStatus } from '../types';

export const BUG_REPORT_LABELS: BugReportLabel[] = [
  'bug',
  'ui',
  'content',
  'performance',
  'accessibility',
  'other',
];

export const BUG_REPORT_STATUSES: BugReportStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'closed',
];

export async function loadBugReports(userId: string, isAdmin: boolean): Promise<BugReport[]> {
  let query = supabase.from('bug_reports').select('*');
  if (!isAdmin) query = query.eq('reporter_id', userId);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BugReport[];
}

export async function createBugReport(input: {
  reporterId: string;
  reporterName: string;
  title: string;
  details: string;
  labels: BugReportLabel[];
}): Promise<BugReport> {
  const { data, error } = await supabase.from('bug_reports').insert({
    reporter_id: input.reporterId,
    reporter_name: input.reporterName.trim(),
    title: input.title.trim(),
    details: input.details.trim(),
    labels: input.labels,
    status: 'open',
  }).select('*').single();
  if (error) throw error;
  return data as BugReport;
}

export async function updateBugReportStatus(id: string, status: BugReportStatus): Promise<BugReport> {
  const { data, error } = await supabase.from('bug_reports').update({
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as BugReport;
}

export async function deleteBugReport(id: string): Promise<void> {
  const { error } = await supabase.from('bug_reports').delete().eq('id', id);
  if (error) throw error;
}

export async function loadBugReportComments(issueIds: string[]): Promise<BugReportComment[]> {
  if (issueIds.length === 0) return [];
  const comments: BugReportComment[] = [];
  for (let offset = 0; offset < issueIds.length; offset += 100) {
    const { data, error } = await supabase.from('bug_report_comments').select('*')
      .in('issue_id', issueIds.slice(offset, offset + 100))
      .order('created_at');
    if (error) throw error;
    comments.push(...(data ?? []) as BugReportComment[]);
  }
  return comments;
}

export async function createBugReportComment(input: {
  issueId: string;
  authorId: string;
  authorName: string;
  body: string;
}): Promise<BugReportComment> {
  const { data, error } = await supabase.from('bug_report_comments').insert({
    issue_id: input.issueId,
    author_id: input.authorId,
    author_name: input.authorName.trim(),
    body: input.body.trim(),
  }).select('*').single();
  if (error) throw error;
  return data as BugReportComment;
}

export async function updateBugReportComment(id: string, body: string): Promise<BugReportComment> {
  const { data, error } = await supabase.from('bug_report_comments').update({
    body: body.trim(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as BugReportComment;
}

export async function deleteBugReportComment(id: string): Promise<void> {
  const { error } = await supabase.from('bug_report_comments').delete().eq('id', id);
  if (error) throw error;
}
