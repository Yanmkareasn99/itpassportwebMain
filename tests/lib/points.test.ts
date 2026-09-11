import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineBattleRoom } from '../../src/lib/points';

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
