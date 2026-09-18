import { describe, expect, it } from 'vitest';
import { extractAnswerMap } from '../../src/lib/pdfAnswerText';
import { createPdfImportCsvFiles } from '../../src/lib/pdfQuestionCsv';
import { parseCsv } from '../../src/lib/csv';

describe('PDF question CSV export', () => {
  it('creates matching question and answer-choice CSV files', () => {
    const ids = [
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ];
    const files = createPdfImportCsvFiles([{
      sourceKey: '2017H:Q1',
      number: 1,
      questionText: 'Question, with "quotes"\nand a new line',
      imageDataUrl: 'data:image/webp;base64,abc123',
      sourcePages: [1],
      subjectId: 'cc000001-0000-0000-0000-000000000001',
      choices: [
        { label: 'A', text: 'First', sortOrder: 1 },
        { label: 'B', text: 'Second', sortOrder: 2 },
      ],
      correctChoice: 'B',
      explanation: 'Because, B is correct.',
      difficulty: 2,
      points: 1,
      warnings: [],
    }], '2017-04-01', () => ids.shift()!);

    const [question] = parseCsv(files.questionsCsv);
    const answers = parseCsv(files.answerChoicesCsv);
    expect(question.id).toBe('10000000-0000-4000-8000-000000000001');
    expect(question.source_key).toBe('2017H:Q1');
    expect(question.exam_date).toBe('2017-04-01');
    expect(question.image_url).toBe('data:image/webp;base64,abc123');
    expect(question.question_text).toBe('Question, with "quotes"\nand a new line');
    expect(answers).toEqual([
      expect.objectContaining({
        id: '20000000-0000-4000-8000-000000000001',
        question_id: question.id,
        choice_text: 'First',
        is_correct: 'false',
        sort_order: '1',
      }),
      expect.objectContaining({
        id: '20000000-0000-4000-8000-000000000002',
        question_id: question.id,
        choice_text: 'Second',
        is_correct: 'true',
        sort_order: '2',
      }),
    ]);
  });
});

describe('PDF answer extraction', () => {
  it('preserves each row instead of overwriting it with the following row answers', () => {
    const labels = ['ア', 'イ', 'ウ', 'エ'];
    const rows = Array.from({ length: 25 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) => {
        const number = row + 1 + column * 25;
        return `問 ${number} ${labels[(number - 1) % 4]}`;
      }).join(' '),
    );
    const answers = extractAnswerMap([{ pageNumber: 1, text: rows.join('\n') }]);
    expect(answers.size).toBe(100);
    for (let number = 1; number <= 100; number += 1) {
      expect(answers.get(number), `answer for question ${number}`).toBe(labels[(number - 1) % 4]);
    }
  });

  it('does not borrow an answer from the next numbered row when an answer is missing', () => {
    const answers = extractAnswerMap([{ pageNumber: 1, text: '問1\n問2 イ\n問3 ウ' }]);
    expect(answers.has(1)).toBe(false);
    expect(answers.get(2)).toBe('イ');
    expect(answers.get(3)).toBe('ウ');
  });

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
