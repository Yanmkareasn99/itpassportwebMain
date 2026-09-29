import { describe, expect, it, vi } from 'vitest';
import { fetchWithGeminiRetry } from '../../supabase/functions/ai-chat/retry';

describe('Gemini overload retry', () => {
  it('retries 503 responses with bounded exponential delays', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const wait = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithGeminiRetry(request, wait);

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([500, 1000]);
  });

  it('returns the final 503 after the retry limit', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const wait = vi.fn().mockResolvedValue(undefined);

    expect((await fetchWithGeminiRetry(request, wait)).status).toBe(503);
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient error', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const wait = vi.fn().mockResolvedValue(undefined);

    expect((await fetchWithGeminiRetry(request, wait)).status).toBe(400);
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
