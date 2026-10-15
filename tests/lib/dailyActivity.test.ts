import { describe, expect, it } from 'vitest';
import { buildDailyActivity } from '../../src/lib/dailyActivity';

const answer = (answeredAt: string, isCorrect: boolean) => ({
  answered_at: answeredAt,
  is_correct: isCorrect,
});

describe('buildDailyActivity', () => {
  it('returns one bucket for each calendar day, including days without sessions', () => {
    const result = buildDailyActivity([
      answer('2026-10-09T08:00:00', true),
      answer('2026-10-09T18:00:00', false),
      answer('2026-10-11T12:00:00', true),
      answer('2026-10-11T12:01:00', true),
      answer('2026-10-11T12:02:00', true),
      answer('2026-10-11T12:03:00', false),
    ], new Date(2026, 9, 11), 3);

    expect(result.map(day => ({
      date: [day.date.getFullYear(), day.date.getMonth() + 1, day.date.getDate()],
      answered: day.answeredCount,
      correct: day.correctCount,
      percentage: day.percentage,
    }))).toEqual([
      { date: [2026, 10, 9], answered: 2, correct: 1, percentage: 50 },
      { date: [2026, 10, 10], answered: 0, correct: 0, percentage: 0 },
      { date: [2026, 10, 11], answered: 4, correct: 3, percentage: 75 },
    ]);
  });

  it('ignores sessions outside the visible date range and invalid timestamps', () => {
    const result = buildDailyActivity([
      answer('2026-10-01T12:00:00', true),
      answer('not-a-date', true),
    ], new Date(2026, 9, 11), 2);

    expect(result).toHaveLength(2);
    expect(result.every(day => day.percentage === 0)).toBe(true);
  });

  it('uses weighted daily accuracy and caps inconsistent data at 100 percent', () => {
    const result = buildDailyActivity([
      answer('2026-10-11T08:00:00', true),
      ...Array.from({ length: 9 }, (_, index) => answer(`2026-10-11T09:0${index}:00`, false)),
    ], new Date(2026, 9, 11), 1);
    expect(result[0].percentage).toBe(10);
  });
});
