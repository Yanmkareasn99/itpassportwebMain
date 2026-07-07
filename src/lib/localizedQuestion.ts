import { Language } from '../contexts/LanguageContext';
import { Question } from '../types';

export function getLocalizedExplanation(question: Question | undefined, language: Language) {
  if (!question) return null;

  if (language === 'en' && question.explanation_en) return question.explanation_en;
  if (language === 'vi' && question.explanation_vi) return question.explanation_vi;
  if (language === 'ja' && question.explanation_ja) return question.explanation_ja;

  return question.explanation;
}
