import { describe, expect, it } from 'vitest';
import { getTokenExpiration, getTokenUserId, isTokenValid, shouldRefreshToken } from '../../src/lib/authHelpers';

function token(payload: Record<string, unknown>) {
  return `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify(payload))}.signature`;
}

describe('auth helpers', () => {
  it('rejects empty, malformed, and expired tokens', () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid('broken')).toBe(false);
    expect(isTokenValid(token({ exp: Math.floor(Date.now() / 1000) - 60 }))).toBe(false);
  });

  it('validates future-expiring tokens', () => {
    expect(isTokenValid(token({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }))).toBe(true);
  });

  it('extracts token expiration and user id', () => {
    const value = token({ sub: 'user-123', exp: 1234567890 });
    expect(getTokenExpiration(value)).toBe(1234567890000);
    expect(getTokenUserId(value)).toBe('user-123');
  });

  it('flags tokens that should be refreshed soon', () => {
    expect(shouldRefreshToken(token({ exp: Math.floor(Date.now() / 1000) + 60 }))).toBe(true);
    expect(shouldRefreshToken(token({ exp: Math.floor(Date.now() / 1000) + 3600 }))).toBe(false);
  });
});
