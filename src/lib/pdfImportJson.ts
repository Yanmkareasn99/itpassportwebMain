import type { PdfImportChoice, PdfImportQuestion } from './pdfQuestionImport';
import type { ItPassportSubjectRange, QuestionImportExam } from './questionSubject';

export const PDF_IMPORT_JSON_SCHEMA = 'manabi-question-archive-v2';
const LEGACY_PDF_IMPORT_JSON_SCHEMA = 'manabi-pdf-import-v1';
const EMPTY_PREVIEW_DATA_URL = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';

export type ReviewPdfImportQuestion = PdfImportQuestion & { subjectId: string };

export interface PdfImportArchive {
  schemaVersion: typeof PDF_IMPORT_JSON_SCHEMA | typeof LEGACY_PDF_IMPORT_JSON_SCHEMA;
  examKey: string;
  examDate: string;
  importExam: QuestionImportExam;
  subjectRanges: ItPassportSubjectRange[];
  questions: ReviewPdfImportQuestion[];
}

export function hasImportablePdfQuestionImage(question: Pick<PdfImportQuestion, 'imageDataUrl'>) {
  return /^(blob:|data:image\/(?:webp|png|jpeg);)/i.test(question.imageDataUrl);
}

function examMetadata(examKey: string, examDate: string) {
  const year = Number(examDate.slice(0, 4)) || Number(examKey.match(/^\d{4}/)?.[0]) || new Date().getFullYear();
  const heisei = examKey.match(/h(\d{1,2})/i)?.[1];
  const reiwa = examKey.match(/r0?(\d{1,2})/i)?.[1];
  const wareki = heisei
    ? `平成${Number(heisei)}年度`
    : reiwa
      ? `${Number(reiwa) === 1 ? '令和元' : `令和${Number(reiwa)}`}年度`
      : year >= 2019
        ? `${year === 2019 ? '令和元' : `令和${year - 2018}`}年度`
        : `平成${year - 1988}年度`;
  const month = examDate.slice(5, 7);
  const season = /h$/i.test(examKey) || month === '04'
    ? '春期'
    : /a$/i.test(examKey) || month === '10'
      ? '秋期'
      : /tokubetsu/i.test(examKey)
        ? '特別試験'
        : '';
  return { year, wareki, season };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`JSON field "${field}" must be a non-empty string.`);
  return value;
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`JSON field "${field}" must be a number.`);
  return value;
}

async function persistentImageDataUrl(question: ReviewPdfImportQuestion) {
  if (!question.keepImage) return null;
  if (!hasImportablePdfQuestionImage(question)) {
    throw new Error(`Question ${question.number} is marked to keep an image, but no importable image is available.`);
  }
  if (question.imageDataUrl.startsWith('data:image/')) return question.imageDataUrl;
  const response = await fetch(question.imageDataUrl);
  if (!response.ok) throw new Error(`Unable to save the image for question ${question.number}.`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Unable to save the image for question ${question.number}.`));
    reader.readAsDataURL(blob);
  });
}

export async function serializePdfImportArchive(input: Omit<PdfImportArchive, 'schemaVersion'>) {
  const questions = [];
  for (const question of input.questions) {
    const imageDataUrl = await persistentImageDataUrl(question);
    const safeExamKey = input.examKey.replace(/[^a-zA-Z0-9_-]/g, '-');
    questions.push({
      number: question.number,
      source_key: question.sourceKey,
      text: question.questionText,
      choices: Object.fromEntries(question.choices.map(choice => [choice.label, choice.text])),
      correct_answer: question.correctChoice,
      has_figure: Boolean(imageDataUrl),
      figure: imageDataUrl ? {
        filename: `${safeExamKey}-question-${question.number}.webp`,
        mime_type: imageDataUrl.slice(5, imageDataUrl.indexOf(';')),
        data_url: imageDataUrl,
        size_bytes: question.imageSizeBytes ?? null,
      } : null,
      confidence: question.warnings.length === 0 ? 'high' : 'review',
      warnings: question.warnings,
      subject_id: question.subjectId,
      explanation: question.explanation,
      difficulty: question.difficulty,
      points: question.points,
      source_pages: question.sourcePages,
    });
  }

  const metadata = examMetadata(input.examKey, input.examDate);

  return `${JSON.stringify({
    schema_version: PDF_IMPORT_JSON_SCHEMA,
    generated_at: new Date().toISOString(),
    exam: input.examKey,
    year: metadata.year,
    wareki: metadata.wareki,
    season: metadata.season,
    exam_date: input.examDate,
    import_exam: input.importExam,
    question_count: questions.length,
    subject_ranges: input.subjectRanges,
    questions,
  }, null, 2)}\n`;
}

function parseChoice(value: unknown, questionIndex: number, choiceIndex: number): PdfImportChoice {
  if (!isRecord(value)) throw new Error(`Question ${questionIndex + 1}, choice ${choiceIndex + 1} is invalid.`);
  return {
    label: requiredString(value.label, `questions[${questionIndex}].choices[${choiceIndex}].label`),
    text: requiredString(value.text, `questions[${questionIndex}].choices[${choiceIndex}].text`),
    sortOrder: finiteNumber(value.sort_order, `questions[${questionIndex}].choices[${choiceIndex}].sort_order`),
  };
}

export function parsePdfImportArchive(text: string): PdfImportArchive {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || ![PDF_IMPORT_JSON_SCHEMA, LEGACY_PDF_IMPORT_JSON_SCHEMA].includes(String(value.schema_version))) {
    throw new Error(`JSON must use schema_version "${PDF_IMPORT_JSON_SCHEMA}" or "${LEGACY_PDF_IMPORT_JSON_SCHEMA}".`);
  }
  const legacy = value.schema_version === LEGACY_PDF_IMPORT_JSON_SCHEMA;
  const importExam = value.import_exam;
  if (!['it-passport', 'fundamental-a', 'fundamental-b', 'ap'].includes(String(importExam))) {
    throw new Error('JSON contains an unsupported import_exam value.');
  }
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    throw new Error('JSON must contain at least one question.');
  }
  if (!legacy && typeof value.question_count === 'number' && value.question_count !== value.questions.length) {
    throw new Error(`JSON question_count is ${value.question_count}, but ${value.questions.length} questions were found.`);
  }

  const questions = value.questions.map((entry, questionIndex): ReviewPdfImportQuestion => {
    if (!isRecord(entry)) throw new Error(`Question ${questionIndex + 1} is invalid.`);
    const choiceEntries = legacy && Array.isArray(entry.choices)
      ? entry.choices.map(choice => {
        if (!isRecord(choice)) return choice;
        return { label: choice.label, text: choice.text, sort_order: choice.sort_order };
      })
      : isRecord(entry.choices)
        ? Object.entries(entry.choices).map(([label, choiceText], index) => ({
          label,
          text: choiceText,
          sort_order: index + 1,
        }))
        : [];
    if (choiceEntries.length < 2) {
      throw new Error(`Question ${questionIndex + 1} must contain at least two choices.`);
    }
    const figure = isRecord(entry.figure) ? entry.figure : null;
    const storedImage = legacy ? entry.image_data_url : figure?.data_url;
    const imageDataUrl = typeof storedImage === 'string'
      && /^data:image\/(?:webp|png|jpeg);/i.test(storedImage)
      ? storedImage
      : EMPTY_PREVIEW_DATA_URL;
    const keepImage = legacy ? entry.keep_image === true : entry.has_figure === true;
    if (keepImage && imageDataUrl === EMPTY_PREVIEW_DATA_URL) {
      throw new Error(`Question ${questionIndex + 1} has a figure, but its embedded data_url is missing.`);
    }
    return {
      sourceKey: requiredString(entry.source_key, `questions[${questionIndex}].source_key`),
      number: finiteNumber(entry.number, `questions[${questionIndex}].number`),
      questionText: requiredString(
        legacy ? entry.question_text : entry.text,
        `questions[${questionIndex}].${legacy ? 'question_text' : 'text'}`,
      ),
      imageDataUrl,
      imageSizeBytes: typeof (legacy ? entry.image_size_bytes : figure?.size_bytes) === 'number'
        ? Number(legacy ? entry.image_size_bytes : figure?.size_bytes)
        : undefined,
      keepImage,
      sourcePages: Array.isArray(entry.source_pages)
        ? entry.source_pages.filter(page => typeof page === 'number')
        : [],
      choices: choiceEntries.map((choice, choiceIndex) => parseChoice(choice, questionIndex, choiceIndex)),
      correctChoice: typeof (legacy ? entry.correct_choice : entry.correct_answer) === 'string'
        ? String(legacy ? entry.correct_choice : entry.correct_answer)
        : '',
      explanation: typeof entry.explanation === 'string' ? entry.explanation : '',
      difficulty: typeof entry.difficulty === 'number' ? entry.difficulty : 2,
      points: typeof entry.points === 'number' ? entry.points : 1,
      warnings: Array.isArray(entry.warnings)
        ? entry.warnings.filter(warning => typeof warning === 'string')
        : [],
      subjectId: typeof entry.subject_id === 'string' ? entry.subject_id : '',
    };
  });

  const ranges = Array.isArray(value.subject_ranges) ? value.subject_ranges : [];
  const subjectRanges = ranges.flatMap(range => {
    if (!isRecord(range) || typeof range.subjectId !== 'string'
      || typeof range.from !== 'number' || typeof range.to !== 'number') return [];
    return [{ subjectId: range.subjectId, from: range.from, to: range.to }];
  });

  return {
    schemaVersion: value.schema_version as PdfImportArchive['schemaVersion'],
    examKey: requiredString(legacy ? value.exam_key : value.exam, legacy ? 'exam_key' : 'exam'),
    examDate: typeof value.exam_date === 'string' ? value.exam_date : '',
    importExam: importExam as QuestionImportExam,
    subjectRanges,
    questions,
  };
}
