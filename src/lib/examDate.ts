import type { Language } from '../i18n';

export const UNCATEGORIZED_EXAM_DATE = 'uncategorized';

export function examPeriodKey(year: number | null | undefined, month: number | null | undefined) {
  if (!year) return UNCATEGORIZED_EXAM_DATE;
  return month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
}

export function formatExamPeriod(year: number, month: number | null | undefined, language: Language) {
  if (!month) return String(year);
  const locale = language === 'ja' ? 'ja-JP' : language === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatExamPeriodKey(key: string, language: Language) {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(key);
  return match ? formatExamPeriod(Number(match[1]), match[2] ? Number(match[2]) : null, language) : key;
}
