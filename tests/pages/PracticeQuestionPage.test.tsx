import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import PracticeQuestionPage from '../../src/pages/PracticeQuestionPage';
import type { Question } from '../../src/types';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null }) }));
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../src/components/QuestionMedia', () => ({ QuestionImage: () => null, AnswerChoiceContent: () => <span>Choose answer</span> }));
vi.mock('../../src/lib/supabase', () => ({ isSupabaseEnabled: true, supabase: { from: mocks.from } }));
const questions = [1, 2].map(id => ({ id: `q${id}`, question_text: `Question text ${id}`, question_type: 'multiple_choice', answer_choices: [{ id: `a${id}`, is_correct: true, choice_text: 'A', sort_order: 0 }] })) as Question[];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
});

it('continues at the next unanswered question after reloading, with no new session creation', () => {
  render(<PracticeQuestionPage currentPage="practice-question" onNavigate={() => {}} sessionId="existing" questions={questions}
    initialAnswers={[{ questionId: 'q1', choiceId: 'a1', isCorrect: true }]} />);
  expect(screen.getByText('Question text 2')).toBeTruthy();
  expect(mocks.from).not.toHaveBeenCalled();
});

it('keeps an answer retryable after a database failure and prevents duplicate clicks while saving', async () => {
  mocks.insert.mockResolvedValueOnce({ error: { message: 'Connection failed' } });
  render(<PracticeQuestionPage currentPage="practice-question" onNavigate={() => {}} sessionId="existing" questions={questions} />);
  fireEvent.click(screen.getByRole('button', { name: /Choose answer/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Answer', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Answer', exact: true }));
  await act(async () => { await Promise.resolve(); });
  expect(mocks.insert).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toBe('Connection failed');
  expect((screen.getByRole('button', { name: /Choose answer/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Answer', exact: true }));
  await act(async () => { await Promise.resolve(); });
  expect(mocks.insert).toHaveBeenLastCalledWith({ session_id: 'existing', question_id: 'q1', selected_choice_id: 'a1', is_correct: true });
  expect((screen.getByRole('button', { name: /Choose answer/ }) as HTMLButtonElement).disabled).toBe(true);
});
