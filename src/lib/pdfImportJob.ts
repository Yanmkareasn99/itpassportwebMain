import type { PdfImportResult } from './pdfQuestionImport';
import type { ItPassportSubjectRange, QuestionImportExam } from './questionSubject';
import { getErrorMessage } from './errorHandling';

export interface PdfImportJobInput {
  questionFile: File;
  answerFile: File | null;
  examKey: string;
  examDate: string;
  importExam: QuestionImportExam;
  subjectRanges: ItPassportSubjectRange[];
}

export interface PdfImportJobSnapshot {
  id: number;
  status: 'idle' | 'processing' | 'complete' | 'error';
  progress: string;
  result: PdfImportResult | null;
  error: string;
  questionFile: File | null;
  answerFile: File | null;
  examKey: string;
  examDate: string;
  importExam: QuestionImportExam;
  subjectRanges: ItPassportSubjectRange[];
}

type PdfProcessor = (
  questionFile: File,
  answerFile: File | null,
  examKey: string,
  onProgress: (progress: string) => void,
  importExam: QuestionImportExam,
) => Promise<PdfImportResult>;

let snapshot: PdfImportJobSnapshot = {
  id: 0,
  status: 'idle',
  progress: '',
  result: null,
  error: '',
  questionFile: null,
  answerFile: null,
  examKey: '',
  examDate: '',
  importExam: 'it-passport',
  subjectRanges: [],
};
const listeners = new Set<() => void>();

function publish(patch: Partial<PdfImportJobSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function releaseResult(result: PdfImportResult | null) {
  for (const question of result?.questions ?? []) {
    if (question.imageDataUrl.startsWith('blob:')) URL.revokeObjectURL(question.imageDataUrl);
  }
}

export function subscribePdfImportJob(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPdfImportJobSnapshot() {
  return snapshot;
}

export function resetPdfImportJob() {
  if (snapshot.status === 'processing') return;
  releaseResult(snapshot.result);
  snapshot = {
    ...snapshot,
    id: snapshot.id + 1,
    status: 'idle',
    progress: '',
    result: null,
    error: '',
    questionFile: null,
    answerFile: null,
    examKey: '',
    examDate: '',
  };
  for (const listener of listeners) listener();
}

export async function startPdfImportJob(
  input: PdfImportJobInput,
  processor?: PdfProcessor,
) {
  if (snapshot.status === 'processing') return;
  releaseResult(snapshot.result);
  const jobId = snapshot.id + 1;
  snapshot = {
    ...input,
    id: jobId,
    status: 'processing',
    progress: '',
    result: null,
    error: '',
  };
  for (const listener of listeners) listener();

  try {
    const run = processor ?? (await import('./pdfQuestionImport')).processExamPdfs;
    const result = await run(
      input.questionFile,
      input.answerFile,
      input.examKey,
      progress => {
        if (snapshot.id === jobId) publish({ progress });
      },
      input.importExam,
    );
    if (snapshot.id === jobId) publish({ status: 'complete', progress: '', result });
  } catch (error) {
    if (snapshot.id === jobId) {
      publish({
        status: 'error',
        progress: '',
        error: getErrorMessage(error, 'PDF processing failed.'),
      });
    }
  }
}
