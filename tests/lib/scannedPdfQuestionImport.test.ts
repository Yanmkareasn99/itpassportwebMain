import { describe, expect, it } from 'vitest';
import {
  findQuestionStarts,
  getQuestionHeadingRetryPages,
  isQuestionRangeHeading,
  mergeExpectedAnswerMaps,
  parseAnswerGridRow,
  selectAnswerTableLines,
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

  it('keeps a real question immediately after a complete section range heading', () => {
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: [
        line('問1から問34までは、ストラテジ系の問題です。', 0.05),
        line('問1 次の記述のうち、適切なものはどれか。', 0.1),
        line('問2 次の記述のうち、適切なものはどれか。', 0.3),
      ],
    }]);

    expect(starts.map(start => start.number)).toEqual([1, 2]);
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

  it('recovers when OCR reads each decade trailing zero as nine', () => {
    const detected = [
      ...Array.from({ length: 9 }, (_, index) => index + 1),
      19,
      ...Array.from({ length: 9 }, (_, index) => index + 11),
      29,
      ...Array.from({ length: 9 }, (_, index) => index + 21),
      39,
      31,
    ];
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: detected.map((number, index) => line(`問${number} 本文`, index / 100)),
    }]);

    expect(starts.map(start => start.number)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
    expect(starts[9].warnings.join(' ')).toMatch(/read question 10 as 19/);
    expect(starts[19].warnings.join(' ')).toMatch(/read question 20 as 29/);
  });

  it('recovers the final question when OCR reads its trailing zero as nine', () => {
    const detected = [
      ...Array.from({ length: 99 }, (_, index) => index + 1),
      109,
    ];
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: detected.map((number, index) => line(`問${number} 本文`, index / 110)),
    }]);

    expect(starts).toHaveLength(100);
    expect(starts.at(-1)?.number).toBe(100);
    expect(starts.at(-1)?.warnings.join(' ')).toMatch(/read question 100 as 109/);
  });

  it('recovers question 100 when OCR reads it as 196', () => {
    const detected = [
      ...Array.from({ length: 99 }, (_, index) => index + 1),
      196,
    ];
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: detected.map((number, index) => line(`問${number} 本文`, index / 110)),
    }], true);

    expect(starts).toHaveLength(100);
    expect(starts.at(-1)?.number).toBe(100);
    expect(starts.at(-1)?.warnings.join(' ')).toMatch(/read question 100 as 196/);
  });

  it('repairs forward OCR jumps without discarding the following headings', () => {
    const detected = Array.from({ length: 100 }, (_, index) => {
      const actualNumber = index + 1;
      if (actualNumber === 20) return 26;
      if (actualNumber === 36) return 37;
      if (actualNumber === 60) return 66;
      return actualNumber;
    });
    const starts = findQuestionStarts([{
      pageNumber: 1,
      lines: detected.map((number, index) => line(`問${number} 本文`, index / 110)),
    }], true);

    expect(starts).toHaveLength(100);
    expect(starts.map(start => start.number)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    expect(starts[19].warnings.join(' ')).toMatch(/read question 20 as 26/);
    expect(starts[35].warnings.join(' ')).toMatch(/read question 36 as 37/);
  });

  it('does not shift later crops when a question heading is genuinely missing', () => {
    const detected = [
      ...Array.from({ length: 35 }, (_, index) => index + 1),
      ...Array.from({ length: 4 }, (_, index) => index + 37),
    ];
    const starts = findQuestionStarts([{
      pageNumber: 17,
      lines: detected.map((number, index) => line(`問${number} 本文`, index / 50)),
    }], true);

    expect(starts.map(start => start.number)).toEqual(detected);
    expect(starts[35]).toMatchObject({ number: 37, pageNumber: 17 });
    expect(starts[35].warnings.join(' ')).toMatch(/Question 36 was not detected/);
  });

  it('recovers question 36 from its section divider when OCR skips its heading', () => {
    const pages = [{
      pageNumber: 17,
      lines: [
        line('\u554f35 \u672c\u6587', 0.1),
        line('\u554f36\u304b\u3089\u554f55\u307e\u3067\u306f\u3001\u30de\u30cd\u30b8\u30e1\u30f3\u30c8\u7cfb\u306e\u554f\u984c\u3067\u3059\u3002', 0.2),
        line('\u554f37 \u672c\u6587', 0.4),
      ],
    }];

    const starts = findQuestionStarts(pages, true);

    expect(starts.map(start => start.number)).toEqual([35, 36, 37]);
    expect(starts[1]).toMatchObject({ number: 36, pageNumber: 17, topRatio: 0.2 });
    expect(starts[1].warnings.join(' ')).toMatch(/recovered from its section divider/);
  });

  it('retries OCR on every page surrounding a missing question heading', () => {
    const starts = [
      { number: 35, pageNumber: 17, topRatio: 0.7, warnings: [] },
      { number: 37, pageNumber: 18, topRatio: 0.3, warnings: [] },
      { number: 38, pageNumber: 18, topRatio: 0.6, warnings: [] },
      { number: 41, pageNumber: 20, topRatio: 0.2, warnings: [] },
    ];

    expect(getQuestionHeadingRetryPages(starts)).toEqual([17, 18, 19, 20]);
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
  it('ignores page rules above and below the regularly spaced answer grid', () => {
    const tableLines = Array.from({ length: 27 }, (_, index) => 200 + index * 40);

    expect(selectAnswerTableLines([60, 110, ...tableLines, 1400])).toEqual(tableLines);
  });

  it('reads the printed question number instead of assigning answers by row position', () => {
    expect(parseAnswerGridRow('問 1 ア')).toEqual({ number: 1, label: 'ア' });
    expect(parseAnswerGridRow('１００ ウ')).toEqual({ number: 100, label: 'ウ' });
    expect(parseAnswerGridRow('問番号 正解')).toBeNull();
  });

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
