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

// Translate application messages at render time so stored notices follow language changes.
// Unknown server diagnostics are preserved instead of hiding their useful details.
const messageTemplates = (Object.keys(en) as TranslationKey[])
  .filter(key => key.startsWith('ui.'))
  .map(key => {
    const names: string[] = [];
    const pattern = en[key].split(/(\{\w+\})/g).map(part => {
      if (/^\{\w+\}$/.test(part)) {
        const name = part.slice(1, -1);
        names.push(name);
        return ['count', 'seconds', 'min', 'max', 'required', 'available'].includes(name)
          ? '([0-9][0-9.,]*)'
          : '([\\s\\S]*?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { key, names, pattern: new RegExp(`^${pattern}$`) };
  }).sort((a, b) => a.names.length - b.names.length);

export function translateMessage(language: Language, message: string): string {
  if (!message || language === 'en') return message;
  for (const { key, names, pattern } of messageTemplates) {
    const match = message.match(pattern);
    if (!match) continue;
    const params = Object.fromEntries(names.map((name, index) => [name,
      name === 'field' ? translateMessage(language, match[index + 1]) : match[index + 1],
    ]));
    return translate(language, key, params);
  }
  return message;
}
