export const IT_PASSPORT_SUBJECT_IDS = {
  strategy: 'cc000001-0000-0000-0000-000000000001',
  management: 'cc000002-0000-0000-0000-000000000001',
  technology: 'cc000003-0000-0000-0000-000000000001',
  unassigned: 'cc000004-0000-0000-0000-000000000001',
} as const;

export const FUNDAMENTAL_IT_SUBJECT_IDS = {
  subjectA: 'aa000000-0000-0000-0000-000000000001',
  subjectB: 'aa000000-0000-0000-0000-000000000002',
} as const;

export const AP_SUBJECT_ID = 'ab000000-0000-0000-0000-000000000001';

export type QuestionImportExam = 'it-passport' | 'fundamental-a' | 'fundamental-b' | 'ap';

export interface ItPassportSubjectRange {
  subjectId: string;
  from: number;
  to: number;
}

export const DEFAULT_IT_PASSPORT_SUBJECT_RANGES: readonly ItPassportSubjectRange[] = [
  { subjectId: IT_PASSPORT_SUBJECT_IDS.strategy, from: 1, to: 35 },
  { subjectId: IT_PASSPORT_SUBJECT_IDS.management, from: 36, to: 55 },
  { subjectId: IT_PASSPORT_SUBJECT_IDS.technology, from: 56, to: 100 },
];

export function validateItPassportSubjectRanges(
  ranges: readonly ItPassportSubjectRange[],
  questionCount = 100,
) {
  if (ranges.some(range => (
    !Number.isInteger(range.from)
    || !Number.isInteger(range.to)
    || range.from < 1
    || range.to > questionCount
    || range.from > range.to
  ))) return false;

  return Array.from({ length: questionCount }, (_, index) => index + 1)
    .every(questionNumber => (
      ranges.filter(range => questionNumber >= range.from && questionNumber <= range.to).length <= 1
    ));
}

export function detectItPassportSubjectId(
  questionNumber: number,
  ranges: readonly ItPassportSubjectRange[] = DEFAULT_IT_PASSPORT_SUBJECT_RANGES,
) {
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 100) return null;
  return ranges.find(range => questionNumber >= range.from && questionNumber <= range.to)?.subjectId
    ?? IT_PASSPORT_SUBJECT_IDS.unassigned;
}

export function detectImportedSubjectId(
  exam: QuestionImportExam,
  questionNumber: number,
  itPassportRanges?: readonly ItPassportSubjectRange[],
) {
  if (exam === 'fundamental-a') return FUNDAMENTAL_IT_SUBJECT_IDS.subjectA;
  if (exam === 'fundamental-b') return FUNDAMENTAL_IT_SUBJECT_IDS.subjectB;
  if (exam === 'ap') return AP_SUBJECT_ID;
  return detectItPassportSubjectId(questionNumber, itPassportRanges);
}

export function resolveImportedSubjectId(
  explicitSubjectId: string | null | undefined,
  questionNumber: number,
  availableSubjectIds: Iterable<string>,
  exam: QuestionImportExam = 'it-passport',
  itPassportRanges?: readonly ItPassportSubjectRange[],
) {
  const available = new Set(availableSubjectIds);
  const explicit = explicitSubjectId?.trim();
  if (explicit) return available.has(explicit) ? explicit : null;

  const detected = detectImportedSubjectId(exam, questionNumber, itPassportRanges);
  return detected && available.has(detected) ? detected : null;
}
