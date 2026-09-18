import { describe, expect, it } from 'vitest';
import { findDuplicateQuestionKeys, normalizeQuestionText } from '../../src/lib/questionDuplicates';

describe('question duplicate detection', () => {
  it('normalizes case, width, line breaks, and spaces', () => {
    expect(normalizeQuestionText(' Ａ B\nC　')).toBe(normalizeQuestionText('a\u200bbc'));
  });

  it('detects duplicate text inside one import and in existing questions', () => {
    const duplicates = findDuplicateQuestionKeys([
      { key: 'Q1', questionText: 'What is SaaS?' },
      { key: 'Q2', questionText: 'What is PaaS?' },
      { key: 'Q3', questionText: ' WHAT IS  SaaS? ' },
    ], [{ questionText: 'What is PaaS?' }]);

    expect(new Set(duplicates)).toEqual(new Set(['Q1', 'Q2', 'Q3']));
  });

  it('allows a PDF source key to update itself but rejects the same text under another key', () => {
    const existing = [{ questionText: 'Existing question', sourceKey: '2026A:Q1' }];
    expect(findDuplicateQuestionKeys([
      { key: 'Q1', questionText: 'Existing question', sourceKey: '2026A:Q1' },
    ], existing, { allowMatchingSourceKey: true })).toEqual([]);

    expect(findDuplicateQuestionKeys([
      { key: 'Q1', questionText: 'Existing question', sourceKey: '2026B:Q1' },
    ], existing, { allowMatchingSourceKey: true })).toEqual(['Q1']);
  });
});
