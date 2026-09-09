import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import BattlePage from '../../src/pages/BattlePage';

const mocks = vi.hoisted(() => ({
  room: { id: 'room-1', creator_id: 'me', opponent_id: 'them', status: 'active', question_ids: ['q1'], time_per_question_seconds: 30, wager_points: 0, creator_score: 0, opponent_score: 0, created_at: new Date().toISOString() },
  answers: [] as Array<{ user_id: string; question_id: string; selected_choice_id: string | null; is_correct: boolean }>,
  create: vi.fn(), submit: vi.fn(), complete: vi.fn(), channel: vi.fn(),
}));
vi.mock('../../src/contexts/AuthContext', () => {
  const auth = { profile: { id: 'me', name: 'Me' } };
  return { useAuth: () => auth };
});
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../src/components/QuestionMedia', () => ({ QuestionImage: () => null, AnswerChoiceContent: () => <span>Answer A</span> }));
vi.mock('../../src/lib/points', () => ({
  getPointBalance: async () => ({ balance: 100 }),
  createOnlineBattleRoom: mocks.create, joinOnlineBattleRoom: vi.fn(), cancelOnlineBattleRoom: vi.fn(),
  submitOnlineBattleAnswer: mocks.submit, completeOnlineBattleRoom: mocks.complete,
}));
vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: (table: string) => {
      const data = () => table === 'battle_rooms' ? [{ ...mocks.room }] : table === 'battle_answers' ? [...mocks.answers] : table === 'questions' ? [{ id: 'q1', question_text: 'Test question', answer_choices: [{ id: 'a1', choice_text: 'Answer A', sort_order: 0, is_correct: true }] }] : [];
      const query = {
        select: () => query, eq: () => query, or: () => query, order: () => query, limit: () => query, in: () => query,
        single: async () => ({ data: { ...mocks.room }, error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: data(), error: null }).then(resolve),
      };
      return query;
    },
    channel: mocks.channel,
    removeChannel: vi.fn(),
  },
}));

async function flush() { await act(async () => { await Promise.resolve(); }); }
async function resume() {
  render(<BattlePage currentPage="battle" onNavigate={() => {}} />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
  await flush();
}
async function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.room.status = 'active';
  mocks.room.time_per_question_seconds = 30;
  mocks.room.creator_id = 'me';
  mocks.room.opponent_id = 'them';
  mocks.answers = [{ user_id: 'them', question_id: 'q1', selected_choice_id: 'a1', is_correct: true }];
  mocks.channel.mockImplementation(() => { const channel = { on: () => channel, subscribe: () => channel }; return channel; });
  mocks.submit.mockImplementation(async (_room, question, choice) => {
    mocks.answers.push({ user_id: 'me', question_id: question, selected_choice_id: choice, is_correct: choice === 'a1' });
    return { ...mocks.room };
  });
  mocks.create.mockImplementation(async () => ({ ...mocks.room }));
  mocks.complete.mockImplementation(async () => { mocks.room.status = 'completed'; return { ...mocks.room, winner_id: 'them' }; });
});
afterEach(() => { vi.useRealTimers(); });

describe('battle recovery', () => {
  it('persists timed-out questions and settles instead of waiting forever', async () => {
    await resume();
    await tick(32);
    expect(mocks.submit).toHaveBeenCalledWith('room-1', 'q1', null);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Defeat')).toBeTruthy();
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });

  it('allows retry after an answer submission fails', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('Connection lost'));
    await resume();
    fireEvent.click(screen.getByRole('button', { name: /Answer A/ }));
    await flush();
    expect(screen.getByText('Connection lost')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Answer A/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Answer A/ }));
    await flush();
    await tick(2);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });

  it('resumes an already answered battle and settles it without another answer', async () => {
    mocks.answers.push({ user_id: 'me', question_id: 'q1', selected_choice_id: null, is_correct: false });
    await resume();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('retries settlement after a temporary failure', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('Settlement unavailable'));
    mocks.answers.push({ user_id: 'me', question_id: 'q1', selected_choice_id: null, is_correct: false });
    await resume();
    await tick(3);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Defeat')).toBeTruthy();
  });

  it('starts a waiting room through polling without recreating its subscription', async () => {
    mocks.room.status = 'waiting';
    await resume();
    expect(screen.getByText(/Keep this page open/)).toBeTruthy();
    mocks.room.status = 'active';
    await tick(3);
    expect(screen.getByText('Test question')).toBeTruthy();
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });
});

it('sends the chosen question count and time when creating a room', async () => {
  mocks.room.status = 'waiting';
  render(<BattlePage currentPage="battle" onNavigate={() => {}} />);
  await flush();
  fireEvent.change(screen.getByLabelText('Question count (1-20)'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Seconds per question (5-300)'), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
  await flush();
  expect(mocks.create).toHaveBeenCalledWith(50, 7, 45);
});

it.each(['creator', 'opponent'])('uses the room time limit for the %s', async role => {
  mocks.room.time_per_question_seconds = 5;
  if (role === 'opponent') {
    mocks.room.creator_id = 'them';
    mocks.room.opponent_id = 'me';
  }
  await resume();
  await tick(4);
  expect(mocks.submit).not.toHaveBeenCalled();
  await tick(1);
  expect(mocks.submit).toHaveBeenCalledWith('room-1', 'q1', null);
});
