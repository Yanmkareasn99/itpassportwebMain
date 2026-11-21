import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import BattlePage from '../../src/pages/BattlePage';
import { PRACTICE_PROGRESS_CHANGED_EVENT } from '../../src/lib/practiceProgressEvents';

const mocks = vi.hoisted(() => ({
  room: {
    id: 'room-1',
    creator_id: 'me',
    opponent_id: 'them' as string | null,
    status: 'active',
    question_ids: ['q1'],
    time_per_question_seconds: 30,
    wager_points: 0,
    creator_score: 0,
    opponent_score: 0,
    winner_id: null as string | null,
    abandoning_user_id: null as string | null,
    abandonment_deadline_at: null as string | null,
    created_at: new Date().toISOString(),
  },
  matchRooms: [] as Array<Record<string, unknown>>,
  answers: [] as Array<{ user_id: string; question_id: string; selected_choice_id: string | null; is_correct: boolean }>,
  balance: 100,
  rankings: [
    { ranking_position: 1, user_id: 'alice', name: 'Alice', win_count: 4, correct_answer_count: 100 },
    { ranking_position: 2, user_id: 'me', name: 'Me', win_count: 3, correct_answer_count: 120 },
  ],
  create: vi.fn(), join: vi.fn(), cancel: vi.fn(), expire: vi.fn(), expireAbandoned: vi.fn(), leave: vi.fn(), rejoin: vi.fn(), abandon: vi.fn(), submit: vi.fn(), complete: vi.fn(), channel: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../../src/contexts/AuthContext', () => {
  const auth = { profile: { id: 'me', name: 'Me' } };
  return { useAuth: () => auth };
});
vi.mock('../../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../../src/components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../src/components/QuestionMedia', () => ({ QuestionImage: () => null, AnswerChoiceContent: () => <span>Answer A</span> }));
vi.mock('../../src/lib/points', () => ({
  getPointBalance: async () => ({ balance: mocks.balance }),
  createOnlineBattleRoom: mocks.create, joinOnlineBattleRoom: mocks.join, cancelOnlineBattleRoom: mocks.cancel,
  expireStaleBattleRooms: mocks.expire,
  expireAbandonedBattleRooms: mocks.expireAbandoned,
  BATTLE_ROOM_TIMEOUT_MINUTES: 15,
  BATTLE_REJOIN_GRACE_SECONDS: 180,
  leaveActiveBattleRoom: mocks.leave,
  rejoinActiveBattleRoom: mocks.rejoin,
  abandonActiveBattleRoom: mocks.abandon,
  submitOnlineBattleAnswer: mocks.submit, completeOnlineBattleRoom: mocks.complete,
}));
vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: (table: string) => {
      let creatorToExclude: string | undefined;
      const data = () => table === 'battle_rooms'
        ? creatorToExclude
          ? mocks.matchRooms.filter(room => room.creator_id !== creatorToExclude)
          : [{ ...mocks.room }]
        : table === 'battle_answers' ? [...mocks.answers] : table === 'questions' ? [{ id: 'q1', question_text: 'Test question', answer_choices: [{ id: 'a1', choice_text: 'Answer A', sort_order: 0, is_correct: true }] }] : [];
      const query = {
        select: () => query, eq: () => query, neq: (_column: string, value: string) => { creatorToExclude = value; return query; }, or: () => query, order: () => query, limit: () => query, in: () => query,
        single: async () => ({ data: { ...mocks.room }, error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: data(), error: null }).then(resolve),
      };
      return query;
    },
    channel: mocks.channel,
    removeChannel: vi.fn(),
    rpc: mocks.rpc,
  },
}));

async function flush() { await act(async () => { await Promise.resolve(); }); }
// Lets the chain of async loads (rooms, balance, questions, answers) finish.
async function settle(times = 10) { for (let i = 0; i < times; i++) await flush(); }
async function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}

async function renderLobby() {
  render(<BattlePage currentPage="battle" onNavigate={() => {}} />);
  await settle();
}

// "1 vs 1 Battle" tile -> create-room dialog. Waits for the balance to load first,
// otherwise the default wager (50) is treated as insufficient.
async function openCreateRoom() {
  await renderLobby();
  fireEvent.click(screen.getByRole('button', { name: /1 vs 1 Battle/ }));
  await flush();
  return screen.getByRole('dialog');
}

// "Join" tile -> room-code dialog -> type the code -> press Join.
async function openJoinByCode(code: string) {
  fireEvent.click(screen.getByRole('button', { name: /Enter room code/ }));
  await flush();
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByPlaceholderText(/room code/i), { target: { value: code } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
  await settle();
}

// Opens an existing room. The creator is picked up automatically from the lobby once the
// room is active; the opponent has to enter the room code.
async function resume() {
  mocks.room.status = 'active';
  await renderLobby();
  if (mocks.room.creator_id !== 'me') {
    await openJoinByCode('room-1');
  }
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.room.status = 'waiting';
  mocks.balance = 100;
  mocks.room.time_per_question_seconds = 30;
  mocks.room.wager_points = 0;
  mocks.room.creator_id = 'me';
  mocks.room.opponent_id = 'them';
  mocks.room.winner_id = null;
  mocks.room.abandoning_user_id = null;
  mocks.room.abandonment_deadline_at = null;
  mocks.matchRooms = [];
  mocks.answers = [{ user_id: 'them', question_id: 'q1', selected_choice_id: 'a1', is_correct: true }];
  mocks.channel.mockImplementation((name: string) => {
    let presenceSync: (() => void) | undefined;
    const channel = {
      on: (event: string, config: { event?: string }, callback?: () => void) => {
        if (event === 'presence' && config.event === 'sync') presenceSync = callback;
        return channel;
      },
      subscribe: (callback?: (status: string) => void) => {
        callback?.('SUBSCRIBED');
        if (name === 'battle-online-users') presenceSync?.();
        return channel;
      },
      presenceState: () => ({
        me: [{ user_id: 'me' }, { user_id: 'me' }],
        them: [{ user_id: 'them' }],
      }),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
    };
    return channel;
  });
  mocks.rpc.mockResolvedValue({ data: mocks.rankings, error: null });
  mocks.submit.mockImplementation(async (_room, question, choice) => {
    mocks.answers.push({ user_id: 'me', question_id: question, selected_choice_id: choice, is_correct: choice === 'a1' });
    return { ...mocks.room };
  });
  mocks.create.mockImplementation(async () => ({ ...mocks.room }));
  mocks.join.mockImplementation(async () => {
    mocks.room.opponent_id = 'me';
    mocks.room.status = 'active';
    return { ...mocks.room };
  });
  mocks.cancel.mockResolvedValue({ ...mocks.room, status: 'completed' });
  mocks.expire.mockResolvedValue(0);
  mocks.expireAbandoned.mockResolvedValue(0);
  mocks.leave.mockImplementation(async () => {
    mocks.room.abandoning_user_id = 'me';
    mocks.room.abandonment_deadline_at = new Date(Date.now() + 180_000).toISOString();
    return { ...mocks.room };
  });
  mocks.rejoin.mockImplementation(async () => {
    mocks.room.abandoning_user_id = null;
    mocks.room.abandonment_deadline_at = null;
    return { ...mocks.room };
  });
  mocks.abandon.mockImplementation(async () => {
    mocks.room.status = 'completed';
    mocks.room.winner_id = 'them';
    return { ...mocks.room };
  });
  mocks.complete.mockImplementation(async () => { mocks.room.status = 'completed'; return { ...mocks.room, winner_id: 'them' }; });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------- Lobby

it('shows rankings ordered by wins with battle correct answers as the tiebreak statistic', async () => {
  await renderLobby();

  expect(screen.getByText('Battle Rankings')).toBeTruthy();
  expect(screen.getByText('Ranked by wins, then by correct answers in battles only.')).toBeTruthy();
  expect(screen.getByText('Battle correct')).toBeTruthy();
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByText('100')).toBeTruthy();
  expect(screen.getByText('Me')).toBeTruthy();
  expect(screen.getByText('You')).toBeTruthy();
  expect(mocks.rpc).toHaveBeenCalledWith('get_battle_rankings', { ranking_limit: 50 });
});

it('shows a deduplicated online-user count above the rankings', async () => {
  await renderLobby();

  const onlineCount = screen.getByText('2 users online');
  const rankings = screen.getByText('Battle Rankings');
  expect(onlineCount.compareDocumentPosition(rankings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

describe('lobby dialogs', () => {
  it('opens the create-room dialog from the 1 vs 1 Battle tile', async () => {
    const dialog = await openCreateRoom();
    expect(within(dialog).getByRole('button', { name: 'Create Room' })).toBeTruthy();
    expect(within(dialog).getByLabelText('Question count (1-20)')).toBeTruthy();
  });

  it('starts a system battle when no players are waiting', async () => {
    await renderLobby();
    fireEvent.click(screen.getByRole('button', { name: 'Start battle' }));
    await settle();
    expect(screen.getByText('Test question')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it('joins a randomly matched waiting player when one is available', async () => {
    mocks.matchRooms = [{ ...mocks.room, id: 'waiting-room', creator_id: 'them', opponent_id: null, status: 'waiting' }];
    await renderLobby();
    fireEvent.click(screen.getByRole('button', { name: 'Start battle' }));
    await settle();
    expect(mocks.join).toHaveBeenCalledWith('waiting-room');
  });

  it('opens the room-code dialog from the Join tile', async () => {
    await renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /Enter room code/ }));
    await flush();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByPlaceholderText(/room code/i)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Join' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes the dialog with the Close button', async () => {
    await openCreateRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an error when no room matches the code', async () => {
    await renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /Enter room code/ }));
    await flush();
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/room code/i), { target: { value: 'zzz' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
    await flush();
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeTruthy();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("joins another player's waiting room by code", async () => {
    mocks.room.status = 'waiting';
    mocks.room.creator_id = 'them';
    mocks.room.opponent_id = null;
    await renderLobby();
    await openJoinByCode('room-1');
    expect(mocks.join).toHaveBeenCalledWith('room-1');
  });
});

// ---------------------------------------------------------------- Create room

it('sends the chosen question count and time when creating a room', async () => {
  const dialog = await openCreateRoom();
  fireEvent.change(within(dialog).getByLabelText('Question count (1-20)'), { target: { value: '7' } });
  fireEvent.change(within(dialog).getByLabelText('Seconds per question (5-300)'), { target: { value: '45' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Room' }));
  await flush();
  expect(mocks.create).toHaveBeenCalledWith(50, 7, 45);
});

it('allows the wager to be cleared before entering a new value', async () => {
  const dialog = await openCreateRoom();
  const wagerInput = within(dialog).getByLabelText('Wager points') as HTMLInputElement;
  fireEvent.change(wagerInput, { target: { value: '' } });
  expect(wagerInput.value).toBe('');
  expect((within(dialog).getByRole('button', { name: 'Create Room' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(wagerInput, { target: { value: '100' } });
  expect(wagerInput.value).toBe('100');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Room' }));
  await flush();
  expect(mocks.create).toHaveBeenCalledWith(100, 5, 30);
});

it('accepts a zero wager', async () => {
  const dialog = await openCreateRoom();
  fireEvent.change(within(dialog).getByLabelText('Wager points'), { target: { value: '0' } });
  const button = within(dialog).getByRole('button', { name: 'Create Room' }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await flush();
  expect(mocks.create).toHaveBeenCalledWith(0, 5, 30);
});

it.each(['-1', '1.5'])('rejects an invalid wager of %s', async value => {
  const dialog = await openCreateRoom();
  fireEvent.change(within(dialog).getByLabelText('Wager points'), { target: { value } });
  expect((within(dialog).getByRole('button', { name: 'Create Room' }) as HTMLButtonElement).disabled).toBe(true);
});

it('rejects a wager above the current balance with a clear message', async () => {
  mocks.balance = 25;
  const dialog = await openCreateRoom();
  fireEvent.change(within(dialog).getByLabelText('Wager points'), { target: { value: '26' } });
  expect(within(dialog).getByText('Insufficient points')).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Create Room' }) as HTMLButtonElement).disabled).toBe(true);
});

it('guards concurrent create-room submissions', async () => {
  let resolveCreate: ((room: typeof mocks.room) => void) | undefined;
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { resolveCreate = resolve; }));
  const dialog = await openCreateRoom();
  const button = within(dialog).getByRole('button', { name: 'Create Room' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  resolveCreate?.({ ...mocks.room });
  await flush();
});

// ---------------------------------------------------------------- Waiting room

describe('waiting room', () => {
  async function createAndWait() {
    mocks.room.status = 'waiting';
    const dialog = await openCreateRoom();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Room' }));
    await settle();
  }

  it('submits exactly one cancellation for repeated refund clicks', async () => {
    let resolveCancel: ((room: typeof mocks.room) => void) | undefined;
    mocks.cancel.mockImplementationOnce(() => new Promise(resolve => { resolveCancel = resolve; }));
    await createAndWait();
    const cancel = screen.getByRole('button', { name: 'Cancel and Refund' });
    fireEvent.click(cancel);
    fireEvent.click(cancel);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    resolveCancel?.({ ...mocks.room, status: 'completed' });
    await flush();
  });

  it('returns to the lobby with Check Rooms without cancelling the room', async () => {
    await createAndWait();

    fireEvent.click(screen.getByRole('button', { name: 'Check Rooms' }));
    await settle();

    expect(screen.getByText('Battle Rankings')).toBeTruthy();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.expire).toHaveBeenCalled();
  });

  it('can go back into the same waiting room by entering its code', async () => {
    await createAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'Check Rooms' }));
    await settle();

    await openJoinByCode('room-1');

    expect(screen.getByRole('button', { name: 'Cancel and Refund' })).toBeTruthy();
    expect(mocks.join).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Battle recovery

describe('battle recovery', () => {
  it('persists timed-out questions and settles instead of waiting forever', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await resume();
    await tick(32);
    expect(mocks.submit).toHaveBeenCalledWith('room-1', 'q1', null);
    expect(dispatch.mock.calls.filter(([event]) => event.type === PRACTICE_PROGRESS_CHANGED_EVENT)).toHaveLength(1);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Defeat')).toBeTruthy();
    expect(mocks.channel.mock.calls.filter(([name]) => String(name).startsWith('battle-room-'))).toHaveLength(1);
  });

  it('allows retry after an answer submission fails', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    mocks.submit.mockRejectedValueOnce(new Error('Connection lost'));
    await resume();
    fireEvent.click(screen.getByRole('button', { name: /Answer A/ }));
    await flush();
    expect(screen.getByText('Connection lost')).toBeTruthy();
    expect(dispatch.mock.calls.filter(([event]) => event.type === PRACTICE_PROGRESS_CHANGED_EVENT)).toHaveLength(0);
    expect((screen.getByRole('button', { name: /Answer A/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Answer A/ }));
    await flush();
    await tick(2);
    expect(dispatch.mock.calls.filter(([event]) => event.type === PRACTICE_PROGRESS_CHANGED_EVENT)).toHaveLength(1);
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
    await renderLobby();
    await openJoinByCode('room-1');
    expect(screen.getByText(/The battle starts automatically/)).toBeTruthy();
    mocks.room.status = 'active';
    await tick(3);
    await settle();
    expect(screen.getByText('Test question')).toBeTruthy();
    expect(mocks.channel.mock.calls.filter(([name]) => String(name).startsWith('battle-room-'))).toHaveLength(1);
  });
});

it('automatically opens the battle when an opponent joins the creator room', async () => {
  mocks.room.status = 'active';
  await renderLobby();

  expect(screen.getByText('Test question')).toBeTruthy();
});

it('allows a player to leave and rejoin during the three-minute grace period', async () => {
  await resume();

  fireEvent.click(screen.getByRole('button', { name: 'Leave Battle' }));
  expect(screen.getByText(/rejoin this battle within 3 minutes/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Leave' }));
  await flush();

  expect(mocks.leave).toHaveBeenCalledWith('room-1');
  expect(screen.getByRole('button', { name: /Rejoin Battle \(3:00\)/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Rejoin Battle/ }));
  await flush();

  expect(mocks.rejoin).toHaveBeenCalledWith('room-1');
});

it('warns before abandonment and records an immediate loss', async () => {
  await resume();
  fireEvent.click(screen.getByRole('button', { name: 'Leave Battle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Leave' }));
  await flush();

  fireEvent.click(screen.getByRole('button', { name: 'Abandon Battle' }));
  expect(screen.getByText(/immediately result in a loss/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Abandon and Lose' }));
  await flush();

  expect(mocks.abandon).toHaveBeenCalledWith('room-1');
  expect(screen.getByText('Defeat')).toBeTruthy();
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

// ---------------------------------------------------------------- Result

it.each([
  ['win', 'me', 'Added', '+100', 'Deducted'],
  ['loss', 'them', 'Deducted', '-50', 'Added'],
  ['draw', null, 'Added', '+50', 'Deducted'],
])('shows battle point changes for a %s', async (_label, winnerId, label, value, absentLabel) => {
  mocks.room.status = 'completed';
  mocks.room.wager_points = 50;
  mocks.room.winner_id = winnerId;
  await renderLobby();

  await openJoinByCode('room-1');

  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByText(value)).toBeTruthy();
  expect(screen.queryByText(absentLabel)).toBeNull();
});
