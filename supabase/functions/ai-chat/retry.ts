const MAX_ATTEMPTS = 3;
const INITIAL_DELAY_MS = 500;

export async function fetchWithGeminiRetry(
  request: () => Promise<Response>,
  wait: (milliseconds: number) => Promise<void> = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await request();
    if (response.status !== 503 || attempt === MAX_ATTEMPTS - 1) return response;
    await wait(INITIAL_DELAY_MS * 2 ** attempt);
  }
  throw new Error('Gemini retry loop ended without a response.');
}
