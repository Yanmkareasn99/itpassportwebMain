import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import MockExamPage from '../../src/pages/MockExamPage';

const mocks = vi.hoisted(() => ({ settings: { question_count: 2, duration_minutes: 1, passing_score_percent: 50 } }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../src/components/QuestionMedia', () => ({ QuestionImage: () => null, AnswerChoiceContent: () => <span>Answer</span> }));
vi.mock('../../src/lib/mockExamSettings', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/mockExamSettings')>(),
  fetchMockExamSettings: async () => ({ ...mocks.settings }),
}));
vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [1, 2, 3].map(id => ({ id: String(id), question_text: `Question ${id}`, answer_choices: [{ id: `a${id}`, is_correct: true, sort_order: 0 }] })), error: null }) }) }) },
}));
async function flush() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => { vi.useFakeTimers(); mocks.settings = { question_count: 2, duration_minutes: 1, passing_score_percent: 50 }; });
afterEach(() => { vi.useRealTimers(); });

it('uses the configured count, timer, and passing score and freezes settings during an attempt', async () => {
  render(<MockExamPage currentPage="mock-exam" onNavigate={() => {}} />);
  await flush();
  expect(screen.getByText('50%')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Start Exam/i }));
  await flush();
  expect(screen.getByText('01:00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Answer/ }));
  mocks.settings = { question_count: 3, duration_minutes: 90, passing_score_percent: 100 };
  for (let i = 0; i < 60; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText('50%')).toBeTruthy();
  expect(screen.getByText(/Passed.*Congratulations/i)).toBeTruthy();
});

it('shows an actionable error when the question bank is too small', async () => {
  mocks.settings.question_count = 4;
  render(<MockExamPage currentPage="mock-exam" onNavigate={() => {}} />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Start Exam/i }));
  await flush();
  expect(screen.getByRole('alert').textContent).toContain('only 3 are available');
});
