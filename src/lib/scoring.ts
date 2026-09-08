export function calculateAccuracy(correctAnswers: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((correctAnswers / totalQuestions) * 100);
}

export function calculateScore(correctAnswers: number, pointsPerQuestion = 1): number {
  return correctAnswers * pointsPerQuestion;
}

export function classifyAccuracy(accuracy: number): 'good' | 'passable' | 'needs-improvement' {
  if (accuracy >= 70) return 'good';
  if (accuracy >= 50) return 'passable';
  return 'needs-improvement';
}
