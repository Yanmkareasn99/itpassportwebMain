import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import HomePage from '../../src/pages/HomePage';
import type { PracticeProgressSession } from '../../src/lib/practice';
import { notifyPracticeProgressChanged, PRACTICE_PROGRESS_CHANGED_STORAGE_KEY } from '../../src/lib/practiceProgressEvents';

const mocks = vi.hoisted(() => ({ loadProgress: vi.fn(), loadExamActivity: vi.fn(), loadBattleActivity: vi.fn(), from: vi.fn() }));
vi.mock('../../src/lib/examActivity', () => ({ loadExamActivity: mocks.loadExamActivity }));
vi.mock('../../src/lib/battleActivity', () => ({ loadBattleActivity: mocks.loadBattleActivity }));
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: { name: 'Student' } }),
}));
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/components/AnnouncementBanner', () => ({ default: () => null }));
vi.mock('../../src/lib/practice', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/practice')>(),
  loadPracticeProgress: mocks.loadProgress,
}));
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: mocks.from } }));

function progress(correct: boolean[]): PracticeProgressSession[] {
  return [{
    id: 'session', user_id: 'me', subject_id: null, total_questions: 10,
    correct_answers: correct.filter(Boolean).length, answered_count: correct.length,
    completed_at: null, created_at: new Date().toISOString(),
    answer_activity: correct.map(is_correct => ({ answered_at: new Date().toISOString(), is_correct })),
  }];
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

function todayBar() {
  const chart = screen.getByRole('img', { name: 'Recent activity' });
  return chart.querySelectorAll('[title]')[9] as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  mocks.from.mockReturnValue(query);
  mocks.loadProgress.mockResolvedValue(progress([true]));
  mocks.loadExamActivity.mockResolvedValue([]);
  mocks.loadBattleActivity.mockResolvedValue([]);
});

it('loads saved mock exam history on login without any practice sessions', async () => {
  mocks.loadProgress.mockResolvedValue([]);
  mocks.loadExamActivity.mockResolvedValue([
    { answered_at: new Date().toISOString(), is_correct: true },
    { answered_at: new Date().toISOString(), is_correct: false },
  ]);
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  expect(mocks.loadExamActivity).toHaveBeenCalledWith('me');
  expect(todayBar().title).toContain('50%');
});

it('loads saved battle history on login and refreshes newly saved answers', async () => {
  mocks.loadProgress.mockResolvedValue([]);
  mocks.loadBattleActivity.mockResolvedValue([
    { answered_at: new Date().toISOString(), is_correct: true },
  ]);
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  expect(mocks.loadBattleActivity).toHaveBeenCalledWith('me');
  expect(todayBar().title).toContain('100%');

  mocks.loadBattleActivity.mockResolvedValue([
    { answered_at: new Date().toISOString(), is_correct: true },
    { answered_at: new Date().toISOString(), is_correct: false },
  ]);
  act(() => notifyPracticeProgressChanged());
  await flush();
  expect(todayBar().title).toContain('50%');
});

it('combines practice, mock exam, and battle answers in the same daily accuracy', async () => {
  mocks.loadExamActivity.mockResolvedValue([
    { answered_at: new Date().toISOString(), is_correct: false },
    { answered_at: new Date().toISOString(), is_correct: false },
  ]);
  mocks.loadBattleActivity.mockResolvedValue([
    { answered_at: new Date().toISOString(), is_correct: false },
  ]);
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  expect(todayBar().title).toContain('25%');
});

it('reports a battle history load failure while retaining available practice activity', async () => {
  mocks.loadBattleActivity.mockRejectedValue(new Error('Battle history unavailable'));
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  expect(screen.getByRole('alert').textContent).toBe('Battle history unavailable');
  expect(todayBar().title).toContain('100%');
});

it('reports a mock history load failure while retaining available practice activity', async () => {
  mocks.loadExamActivity.mockRejectedValue(new Error('Exam history unavailable'));
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  expect(screen.getByRole('alert').textContent).toBe('Exam history unavailable');
  expect(todayBar().title).toContain('100%');
});

it('reloads an answer saved while the initial dashboard request is still in flight', async () => {
  let resolveInitial!: (value: PracticeProgressSession[]) => void;
  mocks.loadProgress.mockReturnValueOnce(new Promise(resolve => { resolveInitial = resolve; }));
  mocks.loadProgress.mockResolvedValue(progress([true, false]));
  render(<HomePage currentPage="home" onNavigate={() => {}} />);

  act(() => { notifyPracticeProgressChanged(); notifyPracticeProgressChanged(); });
  expect(mocks.loadProgress).toHaveBeenCalledTimes(1);
  await act(async () => { resolveInitial(progress([true])); });
  await flush();

  expect(mocks.loadProgress).toHaveBeenCalledTimes(2);
  expect(todayBar().title).toContain('50%');
});

it('refreshes from another tab and when returning to the page', async () => {
  render(<HomePage currentPage="home" onNavigate={() => {}} />);
  await flush();
  mocks.loadProgress.mockResolvedValue(progress([false]));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: PRACTICE_PROGRESS_CHANGED_STORAGE_KEY })));
  await flush();
  expect(todayBar().title).toContain('0%');

  mocks.loadProgress.mockResolvedValue(progress([true, true, false]));
  act(() => window.dispatchEvent(new Event('focus')));
  await flush();
  expect(todayBar().title).toContain('67%');
});

it('does not run a queued refresh after unmount', async () => {
  let resolveInitial!: (value: PracticeProgressSession[]) => void;
  mocks.loadProgress.mockReturnValueOnce(new Promise(resolve => { resolveInitial = resolve; }));
  const { unmount } = render(<HomePage currentPage="home" onNavigate={() => {}} />);
  act(() => notifyPracticeProgressChanged());
  unmount();
  await act(async () => { resolveInitial(progress([true])); });
  expect(mocks.loadProgress).toHaveBeenCalledTimes(1);
});
