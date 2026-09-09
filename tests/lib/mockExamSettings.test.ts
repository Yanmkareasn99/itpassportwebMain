import { describe, expect, it } from 'vitest';
import { DEFAULT_MOCK_EXAM_SETTINGS, hasPassedMockExam, validateMockExamSettings } from '../../src/lib/mockExamSettings';

describe('mock exam settings', () => {
  it('accepts defaults and boundary values', () => {
    expect(() => validateMockExamSettings(DEFAULT_MOCK_EXAM_SETTINGS)).not.toThrow();
    expect(() => validateMockExamSettings({ question_count: 1, duration_minutes: 1, passing_score_percent: 0 })).not.toThrow();
    expect(() => validateMockExamSettings({ question_count: 1000, duration_minutes: 1440, passing_score_percent: 100 })).not.toThrow();
  });
  it.each([
    { question_count: 0 }, { question_count: 1001 }, { question_count: 2.5 },
    { duration_minutes: 0 }, { duration_minutes: 1441 }, { duration_minutes: NaN },
    { passing_score_percent: -1 }, { passing_score_percent: 101 }, { passing_score_percent: Infinity },
  ])('rejects invalid settings: %j', change => {
    expect(() => validateMockExamSettings({ ...DEFAULT_MOCK_EXAM_SETTINGS, ...change })).toThrow();
  });
  it('uses the configured threshold without rounding a failing score up', () => {
    expect(hasPassedMockExam(2, 3, 67)).toBe(false);
    expect(hasPassedMockExam(2, 3, 66)).toBe(true);
    expect(hasPassedMockExam(7, 10, 70)).toBe(true);
    expect(hasPassedMockExam(0, 1, 0)).toBe(true);
    expect(hasPassedMockExam(0, 0, 0)).toBe(false);
  });
});
