import { en } from './locales/en';
import { ja } from './locales/ja';
import { vi } from './locales/vi';

export const supportedLanguages = ['ja', 'en', 'vi'] as const;

export type Language = (typeof supportedLanguages)[number];
export type TranslationKey = keyof typeof ja;
export type TranslationParams = Record<string, string | number>;

export const languageLocales: Record<Language, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  vi: 'vi-VN',
};

export const nativeLanguageNames: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
  vi: 'Tiếng Việt',
};

const catalogs: Record<Language, Record<TranslationKey, string>> = {
  ja,
  en,
  vi,
};

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
) {
  const template = catalogs[language][key] ?? catalogs.ja[key] ?? key;

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : placeholder,
  );
}

export function isLanguage(value: string | null): value is Language {
  return supportedLanguages.includes(value as Language);
}
