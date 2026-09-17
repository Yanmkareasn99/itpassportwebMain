import type { Language } from '../i18n';
import { supabase } from './supabase';

export type AnnouncementSeverity = 'info' | 'warning' | 'urgent';

export interface Announcement {
  id: string;
  title_ja: string;
  title_en: string;
  title_vi: string;
  message_ja: string;
  message_en: string;
  message_vi: string;
  severity: AnnouncementSeverity;
  priority: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnouncementInput = Pick<Announcement,
  | 'title_ja' | 'title_en' | 'title_vi'
  | 'message_ja' | 'message_en' | 'message_vi'
  | 'severity' | 'priority' | 'is_active' | 'starts_at' | 'ends_at'
>;

export function localizedAnnouncement(
  announcement: Announcement,
  language: Language,
) {
  const title = announcement[`title_${language}`].trim()
    || announcement.title_ja.trim()
    || announcement.title_en.trim()
    || announcement.title_vi.trim();
  const message = announcement[`message_${language}`].trim()
    || announcement.message_ja.trim()
    || announcement.message_en.trim()
    || announcement.message_vi.trim();
  return { title, message };
}

export async function fetchActiveAnnouncement(): Promise<Announcement | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Announcement | null;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function saveAnnouncement(
  input: AnnouncementInput,
  id?: string,
): Promise<Announcement> {
  const { data, error } = await supabase.from('announcements')
    .upsert(id ? { id, ...input } : input)
    .select('*')
    .single();
  if (error) throw error;
  return data as Announcement;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
