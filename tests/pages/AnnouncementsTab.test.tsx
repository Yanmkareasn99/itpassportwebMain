import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../src/lib/announcements', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/announcements')>();
  return {
    ...original,
    fetchAnnouncements: vi.fn().mockResolvedValue([]),
    saveAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
  };
});

import { LanguageProvider } from '../../src/contexts/LanguageContext';
import AnnouncementsTab from '../../src/components/admin/tabs/AnnouncementsTab';

it('shows the new announcement form only after opening its dropdown', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><AnnouncementsTab /></LanguageProvider>);

  const toggle = screen.getByRole('button', { name: 'New announcement' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Title (optional)')).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getAllByLabelText('Title (optional)')).toHaveLength(3);

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await waitFor(() => expect(screen.queryByLabelText('Title (optional)')).toBeNull());
});
