import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});

import { LanguageProvider } from '../../src/contexts/LanguageContext';
import QuestionsTab from '../../src/components/admin/tabs/QuestionsTab';

it('closes both admin question menus on outside clicks and Escape', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);

  const addQuestion = screen.getByRole('button', { name: 'Add question' });
  fireEvent.click(addQuestion);
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).toBeNull();

  await waitFor(() => expect(screen.getByRole('button', { name: 'All subjects' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
  const subjectList = screen.getByRole('listbox');
  expect(within(subjectList).getByRole('option', { name: 'All subjects' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
});
