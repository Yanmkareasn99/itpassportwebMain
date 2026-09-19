import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatReply, getQuestionExplanation } from '../../src/lib/aiChat';
import { getRateLimitStatus, isAllowed, resetRateLimit } from '../../src/lib/rateLimiting';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

describe('AI fallback and limits', () => {
  beforeEach(() => {
    resetRateLimit('user-1');
    mocks.invoke.mockReset().mockResolvedValue({ data: null, error: new Error('unavailable') });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an unavailable remote service instead of returning a generic answer', async () => {
    const reply = await getChatReply('Can you make a study plan?', {
      language: 'en',
      profileName: 'Alice',
      subject: { id: 's1', name: 'Strategy', description: null, color: '#3B82F6', created_at: 'now' },
      recentQuestions: [],
      history: [],
    });

    expect(reply).toBe('The AI service is unavailable right now. Please try again shortly.');
  });

  it('enforces per-user request limits', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(isAllowed('user-1')).toBe(true);
    }

    expect(isAllowed('user-1')).toBe(false);
    expect(getRateLimitStatus('user-1').remaining).toBe(0);
  });

  it('includes question images when requesting an explanation', async () => {
    mocks.invoke.mockResolvedValue({ data: { reply: 'Image-based explanation' }, error: null });

    const reply = await getQuestionExplanation(
      '2014h25h Question 88',
      ['A', 'B', 'C', 'D'],
      0,
      2,
      'en',
      'Alice',
      [{ mimeType: 'image/png', data: 'encoded-question-image' }],
    );

    expect(reply).toBe('Image-based explanation');
    expect(mocks.invoke).toHaveBeenCalledWith('ai-chat', expect.objectContaining({
      body: expect.objectContaining({
        images: [{ mimeType: 'image/png', data: 'encoded-question-image' }],
      }),
    }));
  });
});
