import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AnnouncementBanner from '../../src/components/AnnouncementBanner';
import { LanguageProvider } from '../../src/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ fetchActiveAnnouncement: vi.fn() }));

vi.mock('../../src/lib/announcements', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/announcements')>();
  return { ...original, fetchActiveAnnouncement: mocks.fetchActiveAnnouncement };
});

const announcement = {
  id: 'notice-1',
  title_ja: '重要なお知らせ',
  title_en: 'Important notice',
  title_vi: '',
  message_ja: '日本語の本文',
  message_en: 'English message',
  message_vi: '',
  severity: 'info' as const,
  priority: 10,
  is_active: true,
  starts_at: '2026-09-17T00:00:00.000Z',
  ends_at: null,
  created_by: null,
  created_at: '2026-09-17T00:00:00.000Z',
  updated_at: '2026-09-17T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('manabi_language', 'en');
  mocks.fetchActiveAnnouncement.mockResolvedValue(announcement);
});

it('shows the active announcement in the selected language and allows dismissal', async () => {
  render(<LanguageProvider><AnnouncementBanner /></LanguageProvider>);

  await waitFor(() => expect(screen.getByText('Important notice')).toBeTruthy());
  expect(screen.getByText('English message')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('English message')).toBeNull();
  expect(localStorage.getItem('manabi_announcement_dismissed:notice-1:2026-09-17T00:00:00.000Z')).toBe('1');
});

it('does not allow an urgent announcement to be dismissed', async () => {
  mocks.fetchActiveAnnouncement.mockResolvedValue({ ...announcement, severity: 'urgent' });
  render(<LanguageProvider><AnnouncementBanner /></LanguageProvider>);

  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
});
