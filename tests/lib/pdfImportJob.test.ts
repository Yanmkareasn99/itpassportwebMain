import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPdfImportJobSnapshot,
  resetPdfImportJob,
  startPdfImportJob,
  subscribePdfImportJob,
} from '../../src/lib/pdfImportJob';

describe('background PDF import job', () => {
  beforeEach(() => resetPdfImportJob());

  it('keeps processing and retains the result after UI subscribers leave', async () => {
    let finish!: () => void;
    const waitForFinish = new Promise<void>(resolve => { finish = resolve; });
    const listener = vi.fn();
    const unsubscribe = subscribePdfImportJob(listener);
    const input = {
      questionFile: new File(['questions'], 'questions.pdf', { type: 'application/pdf' }),
      answerFile: null,
      examKey: '2026A',
      examDate: '2026-01-01',
      importExam: 'it-passport' as const,
      subjectRanges: [],
    };

    const running = startPdfImportJob(input, async (_questions, _answers, _key, onProgress) => {
      onProgress('OCR page 1');
      await waitForFinish;
      return { questions: [], answerCount: 0 };
    });

    expect(getPdfImportJobSnapshot().status).toBe('processing');
    expect(getPdfImportJobSnapshot().progress).toBe('OCR page 1');
    unsubscribe();
    finish();
    await running;

    expect(getPdfImportJobSnapshot()).toMatchObject({
      status: 'complete',
      examKey: '2026A',
      result: { questions: [], answerCount: 0 },
    });
    expect(listener).toHaveBeenCalled();
  });
});
