import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatReply } from '../../src/lib/aiChat';
import { getRateLimitStatus, isAllowed, resetRateLimit } from '../../src/lib/rateLimiting';

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: new Error('unavailable') }),
    },
  },
}));

describe('AI fallback and limits', () => {
  beforeEach(() => {
    resetRateLimit('user-1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a local answer when the remote AI call fails', async () => {
    const reply = await getChatReply('Can you make a study plan?', {
      language: 'en',
      profileName: 'Alice',
      subject: { id: 's1', name: 'Strategy', description: null, color: '#3B82F6', created_at: 'now' },
      recentQuestions: [],
      history: [],
    });

    expect(reply).toContain('Study Plan');
    expect(reply).toContain('Alice');
  });

  it('enforces per-user request limits', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(isAllowed('user-1')).toBe(true);
    }

    expect(isAllowed('user-1')).toBe(false);
    expect(getRateLimitStatus('user-1').remaining).toBe(0);
  });
});
