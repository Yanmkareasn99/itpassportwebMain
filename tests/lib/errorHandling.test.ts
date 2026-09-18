import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../../src/lib/errorHandling';

describe('error message extraction', () => {
  it('reads Supabase-style error objects with useful details', () => {
    expect(getErrorMessage({
      code: '23505',
      message: 'This question already exists.',
      details: 'Duplicate normalized question text.',
      hint: null,
    })).toBe('This question already exists. — Duplicate normalized question text.');
  });

  it('supports Error, string, and fallback values', () => {
    expect(getErrorMessage(new Error('Network unavailable'))).toBe('Network unavailable');
    expect(getErrorMessage('Upload rejected')).toBe('Upload rejected');
    expect(getErrorMessage(null, 'Unknown failure')).toBe('Unknown failure');
  });
});
