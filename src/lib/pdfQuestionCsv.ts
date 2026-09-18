import type { PdfImportQuestion } from './pdfQuestionImport';

export interface PdfImportCsvQuestion extends PdfImportQuestion {
  subjectId: string;
}

const QUESTION_COLUMNS = [
  'id',
  'subject_id',
  'question_number',
  'question_text',
  'question_type',
  'image_url',
  'explanation',
  'difficulty',
  'points',
  'exam_date',
  'source_key',
  'explanation_ja',
  'explanation_en',
  'explanation_vi',
] as const;

const ANSWER_CHOICE_COLUMNS = [
  'id',
  'question_id',
  'choice_text',
  'is_correct',
  'sort_order',
  'image_url',
] as const;

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv<Column extends string>(
  columns: readonly Column[],
  rows: readonly Record<Column, unknown>[],
) {
  return `\uFEFF${columns.join(',')}\r\n${rows
    .map(row => columns.map(column => csvCell(row[column])).join(','))
    .join('\r\n')}\r\n`;
}

export function createPdfImportCsvFiles(
  questions: readonly PdfImportCsvQuestion[],
  examDate: string,
  createId: () => string = () => crypto.randomUUID(),
) {
  const questionRows: Record<(typeof QUESTION_COLUMNS)[number], unknown>[] = [];
  const answerChoiceRows: Record<(typeof ANSWER_CHOICE_COLUMNS)[number], unknown>[] = [];

  for (const question of questions) {
    const questionId = createId();
    questionRows.push({
      id: questionId,
      subject_id: question.subjectId,
      question_number: question.number,
      question_text: question.questionText,
      question_type: 'multiple_choice',
      image_url: question.imageDataUrl,
      explanation: question.explanation,
      difficulty: question.difficulty,
      points: question.points,
      exam_date: examDate,
      source_key: question.sourceKey,
      explanation_ja: question.explanation,
      explanation_en: '',
      explanation_vi: '',
    });
    for (const choice of question.choices) {
      answerChoiceRows.push({
        id: createId(),
        question_id: questionId,
        choice_text: choice.text.trim() || choice.label,
        is_correct: choice.label === question.correctChoice,
        sort_order: choice.sortOrder,
        image_url: '',
      });
    }
  }

  return {
    questionsCsv: rowsToCsv(QUESTION_COLUMNS, questionRows),
    answerChoicesCsv: rowsToCsv(ANSWER_CHOICE_COLUMNS, answerChoiceRows),
  };
}
