import { describe, expect, it } from 'vitest';
import {
  findQuestionStarts,
  isQuestionRangeHeading,
  mergeExpectedAnswerMaps,
} from '../../src/lib/scannedPdfQuestionImport';

function line(text: string, topRatio = 0.1) {
  return { text, topRatio, bottomRatio: topRatio + 0.02 };
}

describe('scanned PDF question detection', () => {
  it.each([
    '問1から問34までは、ストラテジ系の問題です。',
    '問 35 から 問 54 までは、マネジメント系の問題です。',
    '問55～問100までは、テクノロジ系の問題です。',
    '間55 - 100',
    '問 １ 〜 問 ３４ までは',
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

  it('excludes a range heading split unusually across OCR lines', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問 1 から', 0.05), line('問 34 までは', 0.07), line('問1 本文', 0.2)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1]);
  });

  it('preserves two questions on one page in vertical order', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問2。次の記述', 0.7), line('問1：次の記述', 0.2)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 2]);
  });

  it('drops duplicate question headings and surfaces a warning', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問1 本文', 0.1), line('問1 続き', 0.2), line('問2 本文', 0.3)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 2]);
    expect(starts[0].warnings.join(' ')).toMatch(/more than once/);
  });

  it('keeps detected numbers and warns when a question is missing', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問1 本文', 0.1), line('問3 本文', 0.3)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 3]);
    expect(starts[1].warnings.join(' ')).toMatch(/Question 2 was not detected/);
  });

  it('ignores a false-positive jump when the expected heading follows', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問1 本文', 0.1), line('問77 参照', 0.2), line('問2 本文', 0.3)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 2]);
    expect(starts[0].warnings.join(' ')).toMatch(/false-positive/);
  });

  it('supports common OCR heading confusion and punctuation', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('間1、本文', 0.1), line('問2：本文', 0.2)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 2]);
  });

  it('ignores question numbers outside the supported range', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [line('問0 本文', 0.1), line('問1 本文', 0.2), line('問201 本文', 0.3)],
    }]);

    expect(starts.map(start => start.number)).toEqual([1]);
  });
});

describe('scanned PDF answer reconciliation', () => {
  it('reports a missing expected answer even when an unrelated entry makes the sizes equal', () => {
    const result = mergeExpectedAnswerMaps([1, 2], new Map([[1, 'ア'], [99, 'イ']]));
    expect(result.answerCount).toBe(1);
    expect(result.missingNumbers).toEqual([2]);
    expect(result.answers.has(99)).toBe(false);
  });

  it('uses OCR only to complete missing expected answers', () => {
    const result = mergeExpectedAnswerMaps(
      [1, 2, 3],
      new Map([[1, 'ア'], [3, 'ウ']]),
      new Map([[2, 'イ'], [4, 'エ']]),
    );
    expect([...result.answers.entries()]).toEqual([[1, 'ア'], [3, 'ウ'], [2, 'イ']]);
    expect(result.answerCount).toBe(3);
    expect(result.missingNumbers).toEqual([]);
  });

  it('preserves a valid text-layer answer when OCR conflicts', () => {
    const result = mergeExpectedAnswerMaps([1], new Map([[1, 'ア']]), new Map([[1, 'エ']]));
    expect(result.answers.get(1)).toBe('ア');
  });

  it('handles an empty searchable text layer', () => {
    const result = mergeExpectedAnswerMaps([1, 2], new Map(), new Map([[1, 'ア'], [2, 'イ']]));
    expect(result.answerCount).toBe(2);
    expect(result.missingNumbers).toEqual([]);
  });
});
