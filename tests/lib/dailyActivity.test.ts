import { describe, expect, it } from 'vitest';
import { buildDailyActivity } from '../../src/lib/dailyActivity';

const session = (createdAt: string, answered: number, correct: number) => ({
  created_at: createdAt,
  answered_count: answered,
  correct_answers: correct,
});

describe('buildDailyActivity', () => {
  it('returns one bucket for each calendar day, including days without sessions', () => {
    const result = buildDailyActivity([
      session('2026-10-09T08:00:00', 5, 4),
      session('2026-10-09T18:00:00', 5, 1),
      session('2026-10-11T12:00:00', 4, 3),
    ], new Date(2026, 9, 11), 3);

    expect(result.map(day => ({
      date: [day.date.getFullYear(), day.date.getMonth() + 1, day.date.getDate()],
      answered: day.answeredCount,
      correct: day.correctCount,
      percentage: day.percentage,
    }))).toEqual([
      { date: [2026, 10, 9], answered: 10, correct: 5, percentage: 50 },
      { date: [2026, 10, 10], answered: 0, correct: 0, percentage: 0 },
      { date: [2026, 10, 11], answered: 4, correct: 3, percentage: 75 },
    ]);
  });

  it('ignores sessions outside the visible date range and invalid timestamps', () => {
    const result = buildDailyActivity([
      session('2026-10-01T12:00:00', 10, 10),
      session('not-a-date', 10, 10),
    ], new Date(2026, 9, 11), 2);

    expect(result).toHaveLength(2);
    expect(result.every(day => day.percentage === 0)).toBe(true);
  });

  it('uses weighted daily accuracy and caps inconsistent data at 100 percent', () => {
    const result = buildDailyActivity([
      session('2026-10-11T08:00:00', 1, 1),
      session('2026-10-11T09:00:00', 9, 0),
    ], new Date(2026, 9, 11), 1);
    expect(result[0].percentage).toBe(10);

    expect(buildDailyActivity([
      session('2026-10-11T08:00:00', 1, 2),
    ], new Date(2026, 9, 11), 1)[0].percentage).toBe(100);
  });
});
