import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase', async importOriginal => {
  vi.stubEnv('VITE_USE_SUPABASE', 'false');
  return importOriginal();
});

import { LanguageProvider } from '../../src/contexts/LanguageContext';
import QuestionsTab, { invalidateAdminQuestionCache } from '../../src/components/admin/tabs/QuestionsTab';
import { getLocalRows } from '../../src/lib/localData';

beforeEach(() => {
  invalidateAdminQuestionCache();
  localStorage.removeItem('manabi-local-data');
});

it('closes both admin question menus on outside clicks and Escape', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);
  await screen.findByText(/\d+ items/);

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

it('filters by more than one checked subject', async () => {
  localStorage.setItem('manabi_language', 'en');
  const subjects = getLocalRows('subjects') as Array<{ id: string; name: string }>;
  const questions = getLocalRows('questions') as Array<{ subject_id: string }>;
  const selectedSubjects = subjects
    .filter(subject => questions.some(question => question.subject_id === subject.id))
    .slice(0, 2);
  const expectedCount = questions.filter(question =>
    selectedSubjects.some(subject => subject.id === question.subject_id)).length;

  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);
  await screen.findByText(`${questions.length} items`);
  fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
  const subjectList = screen.getByRole('listbox');
  const allSubjects = within(subjectList).getByRole('checkbox', { name: 'All subjects' });
  const firstSubject = within(subjectList).getByRole('checkbox', {
    name: selectedSubjects[0].name,
  });
  const secondSubject = within(subjectList).getByRole('checkbox', {
    name: selectedSubjects[1].name,
  });

  fireEvent.click(firstSubject);
  fireEvent.click(secondSubject);

  expect(screen.getByRole('listbox')).toBeTruthy();
  expect((firstSubject as HTMLInputElement).checked).toBe(true);
  expect((secondSubject as HTMLInputElement).checked).toBe(true);
  expect((allSubjects as HTMLInputElement).checked).toBe(false);
  expect(screen.getByRole('button', {
    name: `${selectedSubjects[0].name}, ${selectedSubjects[1].name}`,
  })).toBeTruthy();
  expect(await screen.findByText(`${expectedCount} items`)).toBeTruthy();

  fireEvent.click(firstSubject);
  expect((firstSubject as HTMLInputElement).checked).toBe(false);
  expect((secondSubject as HTMLInputElement).checked).toBe(true);

  fireEvent.click(allSubjects);
  expect((allSubjects as HTMLInputElement).checked).toBe(true);
  expect(await screen.findByText(`${questions.length} items`)).toBeTruthy();
});

it('expands and collapses the question search options', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);

  await screen.findByText(/\d+ items/);

  const searchOptions = screen.getByRole('button', { name: 'Question search options' });
  expect(searchOptions.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Question number')).toBeNull();

  fireEvent.click(searchOptions);
  expect(searchOptions.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByLabelText('Question number')).toBeTruthy();
  expect(screen.getByLabelText('Exam year')).toBeTruthy();
  expect(screen.getByLabelText('Question image')).toBeTruthy();
  expect(screen.getByLabelText('Answer image')).toBeTruthy();
  expect(screen.getByLabelText('Question review status')).toBeTruthy();

  fireEvent.click(searchOptions);
  expect(searchOptions.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Question number')).toBeNull();
});

it('goes directly to a typed question-list page and clamps out-of-range pages', async () => {
  localStorage.setItem('manabi_language', 'en');
  const originalQuestions = getLocalRows('questions') as Array<Record<string, unknown>>;
  const questions = Array.from({ length: 120 }, (_, index) => {
    const source = originalQuestions[index % originalQuestions.length];
    return {
      ...source,
      id: `pagination-question-${index + 1}`,
      question_number: index + 1,
      question_text: `Pagination question ${index + 1}`,
    };
  });
  const localData = await import('../../src/lib/localData');
  const originalGetLocalRows = localData.getLocalRows;
  const getLocalRowsSpy = vi.spyOn(localData, 'getLocalRows').mockImplementation((table: string) =>
    table === 'questions' ? questions : originalGetLocalRows(table));

  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);
  await screen.findByText('120 items');

  const pageInput = screen.getByRole('spinbutton', { name: 'Page' });
  fireEvent.change(pageInput, { target: { value: '3' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Go' }));
  expect(await screen.findByText('Pagination question 101')).toBeTruthy();
  expect((pageInput as HTMLInputElement).value).toBe('3');

  fireEvent.change(pageInput, { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  await waitFor(() => expect((pageInput as HTMLInputElement).value).toBe('3'));
  expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(pageInput, { target: { value: '' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Go' }));
  await waitFor(() => expect((pageInput as HTMLInputElement).value).toBe('3'));
  expect(screen.getByText('Pagination question 101')).toBeTruthy();

  fireEvent.change(pageInput, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(await screen.findByText('Pagination question 1')).toBeTruthy();
  expect((pageInput as HTMLInputElement).value).toBe('1');
  expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Pagination question 51')).toBeTruthy();
  await waitFor(() => expect((pageInput as HTMLInputElement).value).toBe('2'));

  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(await screen.findByText('Pagination question 1')).toBeTruthy();
  await waitFor(() => expect((pageInput as HTMLInputElement).value).toBe('1'));

  getLocalRowsSpy.mockRestore();
});

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1' },
    profile: { id: 'admin-1', name: 'Admin User' },
    isAdmin: true,
  }),
}));

it('shows admin review status, shared message, and choice image controls in the question editor', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);

  await screen.findByText(/\d+ items/);

  fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Add question/ }));

  expect(screen.getByLabelText('Review status')).toBeTruthy();
  const reviewMessage = screen.getByLabelText('Message for other admins');
  expect(reviewMessage.style.height).toBe('2.5rem');
  expect(screen.getAllByText('Add image')).toHaveLength(4);
});

it('shows only saved review and message indicators before expanding a question', async () => {
  localStorage.setItem('manabi_language', 'en');
  const question = getLocalRows('questions')[0] as { id: string };
  localStorage.setItem('manabi-local-data', JSON.stringify({
    question_admin_reviews: [{
      question_id: question.id,
      review_status: 'ready_for_review',
      message: 'Check the answer wording',
      updated_by: 'admin-1',
      updated_at: new Date().toISOString(),
    }],
  }));

  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);

  expect(await screen.findByText('Ready for review')).toBeTruthy();
  const messageAuthor = screen.getByText('Admin User');
  expect(messageAuthor.parentElement?.className).toContain('text-emerald-600');
  expect(messageAuthor.parentElement?.getAttribute('aria-label')).toBe(
    'Admin User: Check the answer wording',
  );
  expect(screen.queryByText('No admin message')).toBeNull();
  expect(screen.queryByText('Draft')).toBeNull();
});

it('filters questions by their review status', async () => {
  localStorage.setItem('manabi_language', 'en');
  const questions = getLocalRows('questions') as Array<{ id: string }>;
  const question = questions[0];
  localStorage.setItem('manabi-local-data', JSON.stringify({
    question_admin_reviews: [{
      question_id: question.id,
      review_status: 'ready_for_review',
      message: '',
      updated_by: 'admin-1',
      updated_at: new Date().toISOString(),
    }],
  }));

  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Question search options' }));
  const statusFilter = await screen.findByLabelText('Question review status');
  fireEvent.change(statusFilter, { target: { value: 'ready_for_review' } });

  await waitFor(() => expect(screen.getAllByText('Ready for review')).toHaveLength(2));
  expect(screen.getAllByText('Draft')).toHaveLength(1);

  fireEvent.change(statusFilter, { target: { value: 'none' } });
  await waitFor(() => expect(screen.getByText(`${questions.length - 1} items`)).toBeTruthy());

  fireEvent.change(statusFilter, { target: { value: 'draft' } });
  await waitFor(() => expect(screen.getByText('0 items')).toBeTruthy());
});

it('updates an edited question locally without reloading the full question list', async () => {
  localStorage.setItem('manabi_language', 'en');
  const question = getLocalRows('questions')[0] as {
    id: string;
    answer_choices?: Array<Record<string, unknown>>;
  };
  localStorage.setItem('manabi-local-data', JSON.stringify({
    answer_choices: question.answer_choices ?? [],
  }));

  const localData = await import('../../src/lib/localData');
  const getLocalRowsSpy = vi.spyOn(localData, 'getLocalRows');
  render(<LanguageProvider><QuestionsTab /></LanguageProvider>);
  await screen.findByText(/\d+ items/);

  fireEvent.click(screen.getAllByTitle('Edit question')[0]);
  await screen.findByRole('heading', { name: 'Edit question' });
  const questionText = screen.getByPlaceholderText('Enter the question text...');
  const callsBeforeSave = getLocalRowsSpy.mock.calls
    .filter(([table]) => table === 'questions').length;

  fireEvent.change(questionText, { target: { value: 'Locally updated question text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Locally updated question text')).toBeTruthy();
  const callsAfterSave = getLocalRowsSpy.mock.calls
    .filter(([table]) => table === 'questions').length;
  expect(callsAfterSave - callsBeforeSave).toBe(1);

  getLocalRowsSpy.mockRestore();
});

it('refreshes stale question data when the tab becomes active again', async () => {
  localStorage.setItem('manabi_language', 'en');
  const initialTime = new Date('2026-09-24T00:00:00Z').getTime();
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(initialTime);
  const localData = await import('../../src/lib/localData');
  const getLocalRowsSpy = vi.spyOn(localData, 'getLocalRows');
  const view = render(
    <LanguageProvider><QuestionsTab active /></LanguageProvider>,
  );
  await screen.findByText(/\d+ items/);
  const initialQuestionReads = getLocalRowsSpy.mock.calls
    .filter(([table]) => table === 'questions').length;

  view.rerender(
    <LanguageProvider><QuestionsTab active={false} /></LanguageProvider>,
  );
  view.rerender(
    <LanguageProvider><QuestionsTab active /></LanguageProvider>,
  );
  expect(getLocalRowsSpy.mock.calls
    .filter(([table]) => table === 'questions')).toHaveLength(initialQuestionReads);

  dateNowSpy.mockReturnValue(initialTime + 5 * 60 * 1000 + 1);
  view.rerender(
    <LanguageProvider><QuestionsTab active={false} /></LanguageProvider>,
  );
  view.rerender(
    <LanguageProvider><QuestionsTab active /></LanguageProvider>,
  );

  await waitFor(() => expect(getLocalRowsSpy.mock.calls
    .filter(([table]) => table === 'questions')).toHaveLength(initialQuestionReads + 1));

  getLocalRowsSpy.mockRestore();
  dateNowSpy.mockRestore();
});
