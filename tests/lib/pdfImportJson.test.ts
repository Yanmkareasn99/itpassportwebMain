import { describe, expect, it } from 'vitest';
import {
  parsePdfImportArchive,
  PDF_IMPORT_JSON_SCHEMA,
  serializePdfImportArchive,
} from '../../src/lib/pdfImportJson';

const question = {
  sourceKey: '2027r09:Q1',
  number: 1,
  questionText: 'テスト問題',
  imageDataUrl: 'blob:preview',
  keepImage: false,
  sourcePages: [1],
  choices: [
    { label: 'ア', text: '正解', sortOrder: 1 },
    { label: 'イ', text: '不正解', sortOrder: 2 },
  ],
  correctChoice: 'ア',
  explanation: '説明',
  difficulty: 2,
  points: 1,
  warnings: [],
  subjectId: 'cc000001-0000-0000-0000-000000000001',
};

describe('PDF import JSON', () => {
  it('round-trips reviewed questions without transient preview blobs', async () => {
    const text = await serializePdfImportArchive({
      examKey: '2027r09',
      examDate: '2027-01-01',
      importExam: 'it-passport',
      subjectRanges: [],
      questions: [question],
    });
    const restored = parsePdfImportArchive(text);
    const stored = JSON.parse(text);

    expect(restored.schemaVersion).toBe(PDF_IMPORT_JSON_SCHEMA);
    expect(restored.examKey).toBe('2027r09');
    expect(stored).toMatchObject({
      exam: '2027r09',
      year: 2027,
      wareki: '令和9年度',
      question_count: 1,
    });
    expect(stored.questions[0]).toMatchObject({
      text: question.questionText,
      choices: { ア: '正解', イ: '不正解' },
      correct_answer: 'ア',
      has_figure: false,
      figure: null,
      confidence: 'high',
    });
    expect(restored.questions).toHaveLength(1);
    expect(restored.questions[0]).toMatchObject({
      sourceKey: question.sourceKey,
      questionText: question.questionText,
      correctChoice: 'ア',
      keepImage: false,
      subjectId: question.subjectId,
    });
    expect(restored.questions[0].imageDataUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it('rejects an unsupported schema', () => {
    expect(() => parsePdfImportArchive(JSON.stringify({
      schema_version: 'unknown',
      questions: [],
    }))).toThrow(PDF_IMPORT_JSON_SCHEMA);
  });

  it('requires embedded image data when keep_image is enabled', () => {
    const stored = {
      schema_version: PDF_IMPORT_JSON_SCHEMA,
      exam: '2027r09',
      exam_date: '2027-01-01',
      import_exam: 'it-passport',
      question_count: 1,
      subject_ranges: [],
      questions: [{
        source_key: '2027r09:Q1',
        number: 1,
        text: 'Question',
        has_figure: true,
        figure: null,
        source_pages: [1],
        choices: { ア: 'A', イ: 'B' },
        correct_answer: 'ア',
        explanation: '',
        difficulty: 2,
        points: 1,
        warnings: [],
        subject_id: '',
      }],
    };

    expect(() => parsePdfImportArchive(JSON.stringify(stored))).toThrow('data_url');
  });

  it('continues to read version 1 archives', () => {
    const legacy = {
      schema_version: 'manabi-pdf-import-v1',
      exam_key: '2026B',
      exam_date: '2026-01-01',
      import_exam: 'fundamental-b',
      subject_ranges: [],
      questions: [{
        source_key: '2026B:Q1',
        number: 1,
        question_text: 'Legacy question',
        image_data_url: null,
        keep_image: false,
        source_pages: [1],
        choices: [
          { label: 'ア', text: 'A', sort_order: 1 },
          { label: 'イ', text: 'B', sort_order: 2 },
        ],
        correct_choice: 'イ',
        subject_id: '',
      }],
    };

    const restored = parsePdfImportArchive(JSON.stringify(legacy));
    expect(restored.examKey).toBe('2026B');
    expect(restored.questions[0].correctChoice).toBe('イ');
  });

  it('accepts archives produced by the local AP scanner', () => {
    const stored = {
      schema_version: PDF_IMPORT_JSON_SCHEMA,
      exam: '2025r07h',
      exam_date: '2025-04-01',
      import_exam: 'ap',
      question_count: 1,
      subject_ranges: [],
      questions: [{
        source_key: '2025r07h:Q1', number: 1, text: 'AP question',
        choices: { ア: 'A', イ: 'B' }, correct_answer: 'ア',
        has_figure: false, figure: null, confidence: 'high', warnings: [],
        subject_id: 'ab000000-0000-0000-0000-000000000001',
        explanation: '', difficulty: 2, points: 1, source_pages: [1],
      }],
    };
    expect(parsePdfImportArchive(JSON.stringify(stored)).importExam).toBe('ap');
  });
});
