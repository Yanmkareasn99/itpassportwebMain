import { describe, expect, it } from 'vitest';
import { extractAnswerMap } from '../../src/lib/pdfAnswerText';

describe('PDF answer extraction', () => {
  it('extracts every answer from a multi-column searchable answer table', () => {
    const rows = Array.from({ length: 25 }, (_, index) => {
      const first = index + 1;
      return `問 ${first} ア 問 ${first + 25} イ 問 ${first + 50} ウ 問 ${first + 75} エ`;
    });

    const answers = extractAnswerMap([{ pageNumber: 1, text: rows.join('\n') }]);

    expect(answers.size).toBe(100);
    expect(answers.get(1)).toBe('ア');
    expect(answers.get(26)).toBe('イ');
    expect(answers.get(51)).toBe('ウ');
    expect(answers.get(100)).toBe('エ');
  });

  it('normalizes full-width digits and accepts joined PDF text items', () => {
    const answers = extractAnswerMap([{
      pageNumber: 1,
      text: '問 １ ア問２イ 問　３　ウ\n問4\nエ',
    }]);

    expect([...answers.entries()]).toEqual([[1, 'ア'], [2, 'イ'], [3, 'ウ'], [4, 'エ']]);
  });

  it('maps labels beneath a multiple-column question-number row', () => {
    const answers = extractAnswerMap([{
      pageNumber: 1,
      text: '問 1   問 26   問 51   問 76\nア      イ      ウ      エ',
    }]);

    expect(answers.size).toBe(4);
    expect(answers.get(1)).toBe('ア');
    expect(answers.get(26)).toBe('イ');
    expect(answers.get(51)).toBe('ウ');
    expect(answers.get(76)).toBe('エ');
  });
});
