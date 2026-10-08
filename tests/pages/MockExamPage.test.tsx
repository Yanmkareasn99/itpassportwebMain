import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import MockExamPage from '../../src/pages/MockExamPage';

const mocks = vi.hoisted(() => ({
  settings: { question_count: 2, duration_minutes: 1, passing_score_percent: 50 },
  settingsPromise: null as Promise<{ question_count: number; duration_minutes: number; passing_score_percent: number }> | null,
}));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../src/components/QuestionMedia', () => ({ QuestionImage: () => null, AnswerChoiceContent: () => <span>Answer</span> }));
vi.mock('../../src/lib/mockExamSettings', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/mockExamSettings')>(),
  fetchMockExamSettings: () => mocks.settingsPromise ?? Promise.resolve({ ...mocks.settings }),
}));
vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [1, 2, 3].map(id => ({ id: String(id), question_text: `Question ${id}`, answer_choices: [{ id: `a${id}`, is_correct: true, sort_order: 0 }] })), error: null }) }) }) },
}));
async function flush() { await act(async () => { await Promise.resolve(); }); }

function mockMatchMedia(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isMobile && query === '(max-width: 1023px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.settings = { question_count: 2, duration_minutes: 1, passing_score_percent: 50 };
  mocks.settingsPromise = null;
});
afterEach(() => { vi.useRealTimers(); });

it('does not flash default settings while the configured settings are loading', async () => {
  let resolveSettings!: (settings: typeof mocks.settings) => void;
  mocks.settingsPromise = new Promise(resolve => { resolveSettings = resolve; });

  render(<MockExamPage currentPage="mock-exam" onNavigate={() => {}} />);

  expect(screen.queryByText('8')).toBeNull();
  expect(screen.getAllByText('—')).toHaveLength(3);

  await act(async () => {
    resolveSettings({ question_count: 2, duration_minutes: 1, passing_score_percent: 50 });
    await mocks.settingsPromise;
  });

  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
});

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

it('reveals the question list on mobile only after pressing the go-to-list button, and hides it again after picking a question', async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  mockMatchMedia(true);

  render(<MockExamPage currentPage="mock-exam" onNavigate={() => {}} />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Start Exam/i }));
  await flush();

  const list = document.getElementById('exam-question-list')!;
  // Hidden by default on mobile (lg:block keeps it visible on desktop)
  expect(list.classList.contains('hidden')).toBe(true);
  expect(list.classList.contains('block')).toBe(false);

  // Open the list
  fireEvent.click(screen.getByRole('button', { name: /Go to question list/i }));
  await flush();
  expect(list.classList.contains('block')).toBe(true);
  expect(list.classList.contains('hidden')).toBe(false);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);

  // Picking a question hides the list and scrolls back to the question card
  fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
  await flush();
  expect(list.classList.contains('hidden')).toBe(true);
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});