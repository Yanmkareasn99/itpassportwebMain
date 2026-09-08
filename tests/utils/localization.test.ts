import { describe, expect, it } from 'vitest';
import { getLocalizedExplanation } from '../../src/lib/localizedQuestion';
import { isLanguage, supportedLanguages, translate } from '../../src/i18n';
import type { Question } from '../../src/types';

describe('localization utilities', () => {
  it('interpolates translation parameters', () => {
    expect(translate('en', 'adminPage.userCount', { count: 3 })).toContain('3');
  });

  it('recognizes supported languages', () => {
    expect(supportedLanguages).toEqual(['ja', 'en', 'vi']);
    expect(isLanguage('ja')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });

  it('selects localized explanations with base explanation fallback', () => {
    const question = {
      explanation: 'base',
      explanation_ja: 'ja',
      explanation_en: 'en',
      explanation_vi: null,
    } as Question;

    expect(getLocalizedExplanation(question, 'ja')).toBe('ja');
    expect(getLocalizedExplanation(question, 'en')).toBe('en');
    expect(getLocalizedExplanation(question, 'vi')).toBe('base');
    expect(getLocalizedExplanation(undefined, 'en')).toBeNull();
  });
});
