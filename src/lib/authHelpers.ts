function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    return JSON.parse(atob(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenExpiration(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const expiration = getTokenExpiration(token);
  return expiration !== null && Date.now() < expiration;
}

export function shouldRefreshToken(token: string, thresholdMs = 5 * 60 * 1000): boolean {
  const expiration = getTokenExpiration(token);
  return expiration === null || expiration - Date.now() < thresholdMs;
}

export function getTokenUserId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' ? payload.sub : null;
}
