import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abandonActiveBattleRoom,
  createOnlineBattleRoom,
  expireAbandonedBattleRooms,
  expireStaleBattleRooms,
  leaveActiveBattleRoom,
  rejoinActiveBattleRoom,
} from '../../src/lib/points';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: { rpc: mocks.rpc },
}));

describe('createOnlineBattleRoom', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { id: 'room-1' }, error: null });
  });

  it.each([-1, 1.5, Number.NaN])('rejects invalid wager %s before calling Supabase', async wager => {
    await expect(createOnlineBattleRoom(wager, 5, 30)).rejects.toThrow('Wager must be a non-negative integer.');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('allows a zero wager', async () => {
    await createOnlineBattleRoom(0, 5, 30);
    expect(mocks.rpc).toHaveBeenCalledWith('create_battle_room', {
      wager: 0,
      question_count: 5,
      seconds_per_question: 30,
    });
  });

  it('surfaces an RPC failure without retrying the balance-changing operation', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Insufficient points') });
    await expect(createOnlineBattleRoom(100, 5, 30)).rejects.toThrow('Insufficient points');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

it('requests expiration of stale waiting battle rooms', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: 2, error: null });

  await expect(expireStaleBattleRooms()).resolves.toBe(2);
  expect(mocks.rpc).toHaveBeenCalledWith('expire_stale_battle_rooms');
});

it.each([
  ['leave_active_battle_room', leaveActiveBattleRoom],
  ['rejoin_active_battle_room', rejoinActiveBattleRoom],
  ['abandon_active_battle_room', abandonActiveBattleRoom],
] as const)('calls the %s battle lifecycle RPC', async (rpcName, action) => {
  mocks.rpc.mockResolvedValueOnce({ data: { id: 'room-1' }, error: null });

  await action('room-1');
  expect(mocks.rpc).toHaveBeenCalledWith(rpcName, { target_room_id: 'room-1' });
});

it('requests settlement of expired abandonment grace periods', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: 1, error: null });

  await expect(expireAbandonedBattleRooms()).resolves.toBe(1);
  expect(mocks.rpc).toHaveBeenCalledWith('expire_abandoned_battle_rooms');
});
