export interface DailyActivity {
  date: Date;
  answeredCount: number;
  correctCount: number;
  percentage: number;
}

export interface DailyActivityAnswer {
  answered_at: string;
  is_correct: boolean;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Builds an oldest-to-newest series of local calendar days. */
export function buildDailyActivity(
  answers: DailyActivityAnswer[],
  endDate: Date,
  dayCount = 10,
): DailyActivity[] {
  const count = Math.max(0, Math.floor(dayCount));
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const activityByDate = new Map<string, DailyActivity>();

  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
    activityByDate.set(localDateKey(date), {
      date,
      answeredCount: 0,
      correctCount: 0,
      percentage: 0,
    });
  }

  for (const answer of answers) {
    const date = new Date(answer.answered_at);
    if (Number.isNaN(date.getTime())) continue;
    const activity = activityByDate.get(localDateKey(date));
    if (!activity) continue;
    activity.answeredCount++;
    if (answer.is_correct) activity.correctCount++;
  }

  return [...activityByDate.values()].map(activity => ({
    ...activity,
    percentage: activity.answeredCount > 0
      ? Math.min(100, Math.round((activity.correctCount / activity.answeredCount) * 100))
      : 0,
  }));
}
