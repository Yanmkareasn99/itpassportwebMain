import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfImportQuestion, PdfImportResult } from './pdfQuestionImport';

interface OcrLine {
  text: string;
  topRatio: number;
  bottomRatio: number;
}

interface OcrPage {
  pageNumber: number;
  lines: OcrLine[];
}

interface QuestionStart {
  number: number;
  pageNumber: number;
  topRatio: number;
}

const ANSWER_LABELS = 'アイウエ';

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

async function renderPage(documentProxy: PDFDocumentProxy, pageNumber: number, scale: number) {
  const page = await documentProxy.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, left: number, top: number, width: number, height: number) {
  const output = createCanvas(width, height);
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, left, top, width, height, 0, 0, output.width, output.height);
  return output;
}

function hasInk(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return true;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let inkSamples = 0;
  for (let y = 0; y < canvas.height; y += 6) {
    for (let x = 0; x < canvas.width; x += 6) {
      const offset = (y * canvas.width + x) * 4;
      if (pixels[offset] < 215 || pixels[offset + 1] < 215 || pixels[offset + 2] < 215) {
        inkSamples += 1;
        if (inkSamples >= 20) return true;
      }
    }
  }
  return false;
}

function trimWhitespace(source: HTMLCanvasElement) {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  let left = source.width;
  let right = 0;
  let top = source.height;
  let bottom = 0;
  for (let y = 0; y < source.height; y += 2) {
    for (let x = 0; x < source.width; x += 2) {
      const offset = (y * source.width + x) * 4;
      if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right <= left || bottom <= top) return source;
  const margin = Math.max(18, Math.floor(source.width / 55));
  const cropLeft = Math.max(0, left - margin);
  const cropTop = Math.max(0, top - margin);
  const cropRight = Math.min(source.width, right + margin);
  const cropBottom = Math.min(source.height, bottom + margin);
  return cropCanvas(source, cropLeft, cropTop, cropRight - cropLeft, cropBottom - cropTop);
}

function parseTsv(tsv: string | null | undefined, imageHeight: number): OcrLine[] {
  if (!tsv) return [];
  const grouped = new Map<string, { words: { left: number; text: string }[]; top: number; bottom: number }>();
  const rows = tsv.split(/\r?\n/).slice(1);
  for (const row of rows) {
    const cells = row.split('\t');
    if (cells.length < 12 || cells[0] !== '5') continue;
    const text = cells.slice(11).join('\t').trim();
    if (!text) continue;
    const key = `${cells[2]}:${cells[3]}:${cells[4]}`;
    const left = Number(cells[6]);
    const top = Number(cells[7]);
    const height = Number(cells[9]);
    const line = grouped.get(key) ?? { words: [], top, bottom: top + height };
    line.words.push({ left, text });
    line.top = Math.min(line.top, top);
    line.bottom = Math.max(line.bottom, top + height);
    grouped.set(key, line);
  }
  return [...grouped.values()]
    .sort((left, right) => left.top - right.top)
    .map(line => ({
      text: line.words.sort((left, right) => left.left - right.left).map(word => word.text).join(' '),
      topRatio: line.top / imageHeight,
      bottomRatio: line.bottom / imageHeight,
    }));
}

function groupAdjacent(values: number[]) {
  const groups: number[][] = [];
  for (const value of values) {
    const current = groups[groups.length - 1];
    if (!current || value > current[current.length - 1] + 1) groups.push([value]);
    else current.push(value);
  }
  return groups.map(group => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length));
}

function detectAnswerGrid(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const isDark = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    return pixels[offset] < 170 && pixels[offset + 1] < 170 && pixels[offset + 2] < 170;
  };

  const horizontalCandidates: number[] = [];
  const minimumRun = Math.floor(canvas.width * 0.08);
  for (let y = 0; y < canvas.height; y += 1) {
    let run = 0;
    let longestRun = 0;
    for (let x = 0; x < canvas.width; x += 1) {
      if (isDark(x, y)) {
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
    if (longestRun >= minimumRun) horizontalCandidates.push(y);
  }
  const horizontalLines = groupAdjacent(horizontalCandidates);
  if (horizontalLines.length < 4) return null;

  const tableTop = horizontalLines[0];
  const tableBottom = horizontalLines[horizontalLines.length - 1];
  const tableHeight = tableBottom - tableTop;
  const verticalCandidates: number[] = [];
  for (let x = 0; x < canvas.width; x += 1) {
    let darkPixels = 0;
    for (let y = tableTop; y <= tableBottom; y += 1) {
      if (isDark(x, y)) darkPixels += 1;
    }
    if (darkPixels >= tableHeight * 0.62) verticalCandidates.push(x);
  }
  const verticalLines = groupAdjacent(verticalCandidates);
  if (verticalLines.length < 3) return null;

  const tables: [number, number, number][] = [];
  for (let index = 0; index + 2 < verticalLines.length; index += 3) {
    const table = verticalLines.slice(index, index + 3) as [number, number, number];
    if (table[1] > table[0] && table[2] > table[1]) tables.push(table);
  }
  const rowCount = horizontalLines.length - 2;
  if (!tables.length || rowCount < 2 || rowCount > 100) return null;
  return { horizontalLines, tables, rowCount };
}

function findQuestionStarts(pages: OcrPage[]) {
  const candidates: Array<QuestionStart & { detectedNumber: number }> = [];
  for (const page of pages) {
    for (const line of page.lines) {
      const normalized = line.text.normalize('NFKC').replace(/\s+/g, ' ').trim();
      const match = normalized.match(/^[問間]\s*(\d{1,4})(?:\D|$)/);
      if (!match) continue;
      candidates.push({
        detectedNumber: Number(match[1]),
        number: 0,
        pageNumber: page.pageNumber,
        topRatio: line.topRatio,
      });
    }
  }

  candidates.sort((left, right) => (
    left.pageNumber - right.pageNumber || left.topRatio - right.topRatio
  ));
  let previousNumber = 0;
  return candidates.map(candidate => {
    const expectedNumber = previousNumber + 1;
    const number = previousNumber === 0
      ? candidate.detectedNumber
      : candidate.detectedNumber === expectedNumber
        ? candidate.detectedNumber
        : expectedNumber;
    previousNumber = number;
    return {
      number,
      pageNumber: candidate.pageNumber,
      topRatio: candidate.topRatio,
    };
  }).filter(candidate => candidate.number >= 1 && candidate.number <= 200);
}

function extractAnswers(pages: OcrPage[]) {
  const answers = new Map<number, string>();
  const patterns = [
    new RegExp(`(?:問|間)\\s*(\\d{1,3})\\s*([${ANSWER_LABELS}])`, 'g'),
    new RegExp(`(?:^|\\s)(\\d{1,3})\\s+([${ANSWER_LABELS}])(?=\\s|$)`, 'g'),
  ];
  for (const page of pages) {
    for (const line of page.lines) {
      const normalized = line.text.normalize('NFKC');
      for (const pattern of patterns) {
        for (const match of normalized.matchAll(pattern)) {
          const number = Number(match[1]);
          if (number >= 1 && number <= 200) answers.set(number, match[2]);
        }
      }
    }
  }
  return answers;
}

async function ocrQuestionHeadings(
  documentProxy: PDFDocumentProxy,
  worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>,
  onProgress?: (message: string) => void,
) {
  const pages: OcrPage[] = [];
  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    onProgress?.(`OCR: finding questions on page ${pageNumber} of ${documentProxy.numPages}…`);
    const pageCanvas = await renderPage(documentProxy, pageNumber, 1.8);
    const stripWidth = Math.floor(pageCanvas.width * 0.36);
    const strip = cropCanvas(pageCanvas, 0, 0, stripWidth, pageCanvas.height);
    pageCanvas.width = 1;
    pageCanvas.height = 1;
    if (!hasInk(strip)) {
      pages.push({ pageNumber, lines: [] });
      continue;
    }
    const result = await worker.recognize(strip, {}, { text: true, tsv: true });
    pages.push({ pageNumber, lines: parseTsv(result.data.tsv, strip.height) });
    strip.width = 1;
    strip.height = 1;
  }
  return pages;
}

async function ocrAnswerPages(
  documentProxy: PDFDocumentProxy,
  worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>,
  pageSegmentationModes: typeof import('tesseract.js').PSM,
  onProgress?: (message: string) => void,
) {
  const pages: OcrPage[] = [];
  let nextQuestionNumber = 1;
  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    onProgress?.(`OCR: reading answer page ${pageNumber} of ${documentProxy.numPages}…`);
    const canvas = await renderPage(documentProxy, pageNumber, 3.2);
    if (!hasInk(canvas)) {
      pages.push({ pageNumber, lines: [] });
      continue;
    }
    const grid = detectAnswerGrid(canvas);
    if (grid) {
      const lines: OcrLine[] = [];
      await worker.setParameters({
        tessedit_pageseg_mode: pageSegmentationModes.SINGLE_CHAR,
        tessedit_char_whitelist: ANSWER_LABELS,
      });
      for (const table of grid.tables) {
        for (let rowIndex = 0; rowIndex < grid.rowCount; rowIndex += 1) {
          const left = table[1] + 4;
          const right = table[2] - 4;
          const top = grid.horizontalLines[rowIndex + 1] + 4;
          const bottom = grid.horizontalLines[rowIndex + 2] - 4;
          const cell = cropCanvas(canvas, left, top, right - left, bottom - top);
          const padded = createCanvas(cell.width + 60, cell.height + 60);
          const paddedContext = padded.getContext('2d');
          if (paddedContext) {
            paddedContext.fillStyle = '#ffffff';
            paddedContext.fillRect(0, 0, padded.width, padded.height);
            paddedContext.drawImage(cell, 30, 30);
          }
          const result = await worker.recognize(padded);
          const label = [...result.data.text].find(character => ANSWER_LABELS.includes(character));
          if (label) {
            lines.push({
              text: `問 ${nextQuestionNumber} ${label}`,
              topRatio: top / canvas.height,
              bottomRatio: bottom / canvas.height,
            });
          }
          nextQuestionNumber += 1;
          cell.width = 1;
          cell.height = 1;
          padded.width = 1;
          padded.height = 1;
        }
      }
      await worker.setParameters({
        tessedit_pageseg_mode: pageSegmentationModes.AUTO,
        tessedit_char_whitelist: '',
      });
      pages.push({ pageNumber, lines });
      canvas.width = 1;
      canvas.height = 1;
      continue;
    }
    const result = await worker.recognize(canvas, {}, { text: true, tsv: true });
    pages.push({ pageNumber, lines: parseTsv(result.data.tsv, canvas.height) });
    canvas.width = 1;
    canvas.height = 1;
  }
  return pages;
}

async function renderQuestionCrop(
  documentProxy: PDFDocumentProxy,
  start: QuestionStart,
  next: QuestionStart | undefined,
) {
  const page = await renderPage(documentProxy, start.pageNumber, 1.65);
  const topRatio = Math.max(0, start.topRatio - 0.025);
  const bottomRatio = next?.pageNumber === start.pageNumber
    ? Math.max(topRatio + 0.08, next.topRatio - 0.02)
    : 0.935;
  const top = Math.floor(page.height * topRatio);
  const bottom = Math.min(page.height, Math.ceil(page.height * bottomRatio));
  const cropped = cropCanvas(page, 0, top, page.width, bottom - top);
  page.width = 1;
  page.height = 1;
  const trimmed = trimWhitespace(cropped);
  const dataUrl = trimmed.toDataURL('image/webp', 0.82);
  cropped.width = 1;
  cropped.height = 1;
  if (trimmed !== cropped) {
    trimmed.width = 1;
    trimmed.height = 1;
  }
  return dataUrl;
}

export async function processScannedExamPdfs(
  questionDocument: PDFDocumentProxy,
  answerDocument: PDFDocumentProxy | null,
  examKey: string,
  onProgress?: (message: string) => void,
): Promise<PdfImportResult> {
  onProgress?.('Starting Japanese OCR…');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const headingPages = await ocrQuestionHeadings(questionDocument, worker, onProgress);
    const starts = findQuestionStarts(headingPages);
    if (!starts.length) {
      throw new Error('This scanned PDF could not be segmented into questions. Make sure the pages show headings such as “問1”.');
    }

    const answers = answerDocument
      ? extractAnswers(await ocrAnswerPages(answerDocument, worker, PSM, onProgress))
      : new Map<number, string>();

    const questions: PdfImportQuestion[] = [];
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const next = starts[index + 1];
      onProgress?.(`Preparing question ${index + 1} of ${starts.length}…`);
      const correctChoice = answers.get(start.number) ?? '';
      questions.push({
        sourceKey: `${examKey}:Q${start.number}`,
        number: start.number,
        questionText: `${examKey} 問${start.number}`,
        imageDataUrl: await renderQuestionCrop(questionDocument, start, next),
        sourcePages: [start.pageNumber],
        choices: [...ANSWER_LABELS].map((label, choiceIndex) => ({
          label,
          text: label,
          sortOrder: choiceIndex + 1,
        })),
        correctChoice,
        explanation: '',
        difficulty: 2,
        points: 1,
        warnings: correctChoice ? [] : ['Correct answer not detected. Select it below.'],
      });
    }
    return { questions, answerCount: answers.size };
  } finally {
    await worker.terminate();
  }
}
