import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Header from '../../src/components/Header';

const mocks = vi.hoisted(() => ({
  getPointBalance: vi.fn(),
  getPointHistory: vi.fn(),
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'user-1',
      name: 'Student',
      student_id: 'S-100',
      avatar_url: null,
    },
    signOut: vi.fn(),
  }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/lib/points', () => ({
  getCachedPointBalance: () => 250,
  getPointBalance: mocks.getPointBalance,
  getPointHistory: mocks.getPointHistory,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPointBalance.mockResolvedValue({ balance: 250 });
  mocks.getPointHistory.mockResolvedValue([
    {
      id: 'earned',
      user_id: 'user-1',
      delta: 50,
      reason: 'practice_answer',
      balance_after: 250,
      metadata: { is_correct: true },
      created_at: '2026-10-29T01:00:00.000Z',
    },
    {
      id: 'spent',
      user_id: 'user-1',
      delta: -100,
      reason: 'battle_wager_lock',
      balance_after: 200,
      metadata: {},
      created_at: '2026-10-28T01:00:00.000Z',
    },
  ]);
});

it('opens earned and spent point history from the points badge', async () => {
  render(<Header title="Home" onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open points history' }));

  expect(await screen.findByText('Points history')).toBeTruthy();
  expect(screen.getByText('Practice correct')).toBeTruthy();
  expect(screen.getByText('Battle wager')).toBeTruthy();
  expect(screen.getByText('+50')).toBeTruthy();
  expect(screen.getByText('-100')).toBeTruthy();
  await waitFor(() => expect(mocks.getPointHistory).toHaveBeenCalledWith('user-1'));
});

it('shows an empty state when the user has no point activity', async () => {
  mocks.getPointHistory.mockResolvedValueOnce([]);
  render(<Header title="Home" onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open points history' }));

  expect(await screen.findByText('No points activity yet.')).toBeTruthy();
});

it('shows an error when point history cannot be loaded', async () => {
  mocks.getPointHistory.mockRejectedValueOnce(new Error('Connection failed'));
  render(<Header title="Home" onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open points history' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load points history.');
});
