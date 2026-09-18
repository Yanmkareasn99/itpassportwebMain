export const IT_PASSPORT_SUBJECT_IDS = {
  strategy: 'cc000001-0000-0000-0000-000000000001',
  management: 'cc000002-0000-0000-0000-000000000001',
  technology: 'cc000003-0000-0000-0000-000000000001',
} as const;

export const FUNDAMENTAL_IT_SUBJECT_IDS = {
  subjectA: 'aa000000-0000-0000-0000-000000000001',
  subjectB: 'aa000000-0000-0000-0000-000000000002',
} as const;

export type QuestionImportExam = 'it-passport' | 'fundamental-a' | 'fundamental-b';

/**
 * Official IT Passport exams divide their 100 questions into fixed sections:
 * Strategy (1-35), Management (36-55), and Technology (56-100).
 */
export function detectItPassportSubjectId(questionNumber: number) {
  if (!Number.isInteger(questionNumber)) return null;
  if (questionNumber >= 1 && questionNumber <= 35) return IT_PASSPORT_SUBJECT_IDS.strategy;
  if (questionNumber >= 36 && questionNumber <= 55) return IT_PASSPORT_SUBJECT_IDS.management;
  if (questionNumber >= 56 && questionNumber <= 100) return IT_PASSPORT_SUBJECT_IDS.technology;
  return null;
}

export function detectImportedSubjectId(exam: QuestionImportExam, questionNumber: number) {
  if (exam === 'fundamental-a') return FUNDAMENTAL_IT_SUBJECT_IDS.subjectA;
  if (exam === 'fundamental-b') return FUNDAMENTAL_IT_SUBJECT_IDS.subjectB;
  return detectItPassportSubjectId(questionNumber);
}

export function resolveImportedSubjectId(
  explicitSubjectId: string | null | undefined,
  questionNumber: number,
  availableSubjectIds: Iterable<string>,
  exam: QuestionImportExam = 'it-passport',
) {
  const available = new Set(availableSubjectIds);
  const explicit = explicitSubjectId?.trim();
  if (explicit) return available.has(explicit) ? explicit : null;

  const detected = detectImportedSubjectId(exam, questionNumber);
  return detected && available.has(detected) ? detected : null;
}
