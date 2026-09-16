import type { Language } from '../i18n';

export const UNCATEGORIZED_EXAM_DATE = 'uncategorized';

export function formatExamDate(date: string, language: Language) {
  const locale = language === 'ja' ? 'ja-JP' : language === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
