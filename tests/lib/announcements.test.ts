import { expect, it } from 'vitest';
import { localizedAnnouncement, type Announcement } from '../../src/lib/announcements';

const announcement: Announcement = {
  id: 'notice-1',
  title_ja: '日本語タイトル',
  title_en: 'English title',
  title_vi: '',
  message_ja: '日本語本文',
  message_en: 'English message',
  message_vi: '',
  severity: 'info',
  priority: 0,
  is_active: true,
  starts_at: '2026-09-17T00:00:00.000Z',
  ends_at: null,
  created_by: null,
  created_at: '2026-09-17T00:00:00.000Z',
  updated_at: '2026-09-17T00:00:00.000Z',
};

it('uses the selected announcement language', () => {
  expect(localizedAnnouncement(announcement, 'en')).toEqual({
    title: 'English title',
    message: 'English message',
  });
});

it('falls back to Japanese when a translation is empty', () => {
  expect(localizedAnnouncement(announcement, 'vi')).toEqual({
    title: '日本語タイトル',
    message: '日本語本文',
  });
});
