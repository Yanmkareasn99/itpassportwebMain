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

it('expands and collapses the question search options', () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);

  const searchOptions = screen.getByRole('button', { name: 'Question search options' });
  expect(searchOptions.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Question number')).toBeNull();

  fireEvent.click(searchOptions);
  expect(searchOptions.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByLabelText('Question number')).toBeTruthy();
  expect(screen.getByLabelText('Exam year')).toBeTruthy();
  expect(screen.getByLabelText('Question image')).toBeTruthy();
  expect(screen.getByLabelText('Answer image')).toBeTruthy();

  fireEvent.click(searchOptions);
  expect(searchOptions.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Question number')).toBeNull();
});
