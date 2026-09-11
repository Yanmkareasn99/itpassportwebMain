import { describe, expect, it } from 'vitest';
import { findQuestionStarts, isQuestionRangeHeading } from '../../src/lib/scannedPdfQuestionImport';

function line(text: string, topRatio = 0.1) {
  return { text, topRatio, bottomRatio: topRatio + 0.02 };
}

describe('scanned PDF question detection', () => {
  it.each([
    '問1から問34までは、ストラテジ系の問題です。',
    '問 35 から 問 54 までは、マネジメント系の問題です。',
    '問55～問100までは、テクノロジ系の問題です。',
    '間55 - 100',
  ])('recognizes a section range as a non-question heading: %s', heading => {
    expect(isQuestionRangeHeading(heading)).toBe(true);
  });

  it('removes section dividers without shifting question numbers', () => {
    const pages = [
      { pageNumber: 1, lines: [line('問1から問34までは、ストラテジ系の問題です。')] },
      ...Array.from({ length: 54 }, (_, index) => ({
        pageNumber: index + 2,
        lines: [line(`問${index + 1} 次の記述のうち、適切なものはどれか。`)],
      })),
      { pageNumber: 56, lines: [line('問55から問100までは、テクノロジ系の問題です。')] },
      { pageNumber: 57, lines: [line('問55 次の記述のうち、適切なものはどれか。')] },
    ];

    const starts = findQuestionStarts(pages);

    expect(starts).toHaveLength(55);
    expect(starts[0]).toMatchObject({ number: 1, pageNumber: 2 });
    expect(starts[54]).toMatchObject({ number: 55, pageNumber: 57 });
  });
});
