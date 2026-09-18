import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractAnswerMap, extractPages } from './pdfAnswerText';
import {
  type PdfImportQuestion,
  type PdfImportResult,
} from './pdfQuestionImport';

export interface OcrLine {
  text: string;
  topRatio: number;
  bottomRatio: number;
}

export interface OcrPage {
  pageNumber: number;
  lines: OcrLine[];
}

export interface QuestionStart {
  number: number;
  pageNumber: number;
  topRatio: number;
  warnings: string[];
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

export function selectAnswerTableLines(horizontalLines: number[]) {
  if (horizontalLines.length < 4) return horizontalLines;
  const gaps = horizontalLines.slice(1).map((line, index) => line - horizontalLines[index]);
  const sortedGaps = [...gaps].sort((left, right) => left - right);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  if (medianGap <= 0) return horizontalLines;

  // Answer-table rows are evenly spaced. Page decorations or title rules can
  // also look like horizontal table borders, but their distance from the next
  // line is different. Keep the longest regularly spaced run so an extra line
  // cannot become a fake first answer row and shift answers 2-100 down by one.
  const runs: number[][] = [[horizontalLines[0]]];
  for (let index = 1; index < horizontalLines.length; index += 1) {
    const gap = horizontalLines[index] - horizontalLines[index - 1];
    if (gap >= medianGap * 0.6 && gap <= medianGap * 1.6) {
      runs[runs.length - 1].push(horizontalLines[index]);
    } else {
      runs.push([horizontalLines[index]]);
    }
  }
  return runs.reduce((longest, run) => run.length > longest.length ? run : longest, []);
}

export function parseAnswerGridRow(value: string) {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '');
  const numberMatch = normalized.match(/\d{1,3}/);
  const label = [...normalized].find(character => ANSWER_LABELS.includes(character));
  if (!numberMatch || !label) return null;
  const number = Number(numberMatch[0]);
  if (number < 1 || number > 200) return null;
  return { number, label };
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
  const horizontalLines = selectAnswerTableLines(groupAdjacent(horizontalCandidates));
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

export function isQuestionRangeHeading(value: string) {
  const compact = value.normalize('NFKC').replace(/\s+/g, '');
  return /^[問間]\d{1,4}(?:(?:から|より)|[～〜~\-－—―])[問間]?\d{1,4}(?:まで)?/.test(compact);
}

export function findQuestionStarts(pages: OcrPage[], repairForwardJumps = false) {
  const candidates: Array<QuestionStart & { detectedNumber: number }> = [];
  const rangeHints: Array<QuestionStart & { detectedNumber: number }> = [];
  for (const page of pages) {
    for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
      const line = page.lines[lineIndex];
      const normalized = line.text.normalize('NFKC').replace(/\s+/g, ' ').trim();
      const previousLine = page.lines[lineIndex - 1]?.text ?? '';
      const nextLine = page.lines[lineIndex + 1]?.text ?? '';
      // Section dividers such as "問1から問34までは、ストラテジ系の問題です。"
      // are not questions. Treating one as a start shifts every later question and answer.
      const ownRangeHeading = isQuestionRangeHeading(normalized);
      const nextRangeHeading = isQuestionRangeHeading(`${normalized} ${nextLine}`);
      const previousRangeHeading = !isQuestionRangeHeading(previousLine)
        && isQuestionRangeHeading(`${previousLine} ${normalized}`);
      if (
        ownRangeHeading
        || nextRangeHeading
        // Only join the previous line when it is an incomplete range heading.
        // A complete section heading immediately above a real question (for
        // example, "問1から問34まで..." followed by "問1 ...") must not
        // consume that question as part of the range.
        || previousRangeHeading
      ) {
        if (repairForwardJumps) {
          const rangeText = ownRangeHeading
            ? normalized
            : nextRangeHeading
              ? `${normalized} ${nextLine}`
              : `${previousLine} ${normalized}`;
          const rangeStart = Number(rangeText.normalize('NFKC').match(/\d{1,4}/)?.[0]);
          if (rangeStart >= 1 && rangeStart <= 200) {
            rangeHints.push({
              detectedNumber: rangeStart,
              number: 0,
              pageNumber: page.pageNumber,
              topRatio: previousRangeHeading
                ? (page.lines[lineIndex - 1]?.topRatio ?? line.topRatio)
                : line.topRatio,
              warnings: [],
            });
          }
        }
        continue;
      }
      const match = normalized.match(/^[問間癌]\s*(\d{1,4})(?:\D|$)/);
      if (!match) continue;
      const detectedNumber = Number(match[1]);
      if (detectedNumber < 1 || detectedNumber > 999) continue;
      candidates.push({
        detectedNumber,
        number: 0,
        pageNumber: page.pageNumber,
        topRatio: line.topRatio,
        warnings: [],
      });
    }
  }

  candidates.sort((left, right) => (
    left.pageNumber - right.pageNumber || left.topRatio - right.topRatio
  ));

  // OCR sometimes merges the first question of a section into its divider or
  // misses that question heading entirely. A divider such as "questions
  // 36-55" gives us a reliable crop boundary only when question 35 is before
  // it and question 37 is after it. Keep this recovery deliberately narrow so
  // a genuinely missing heading elsewhere never shifts all subsequent crops.
  const isBefore = (
    left: Pick<QuestionStart, 'pageNumber' | 'topRatio'>,
    right: Pick<QuestionStart, 'pageNumber' | 'topRatio'>,
  ) => left.pageNumber < right.pageNumber
    || (left.pageNumber === right.pageNumber && left.topRatio < right.topRatio);
  for (const hint of rangeHints) {
    if (candidates.some(candidate => candidate.detectedNumber === hint.detectedNumber)) continue;
    const previous = candidates.find(candidate => (
      candidate.detectedNumber === hint.detectedNumber - 1 && isBefore(candidate, hint)
    ));
    const next = candidates.find(candidate => (
      candidate.detectedNumber === hint.detectedNumber + 1 && isBefore(hint, candidate)
    ));
    if (!previous || !next) continue;
    hint.warnings.push(
      `Question ${hint.detectedNumber} heading was recovered from its section divider; review its crop.`,
    );
    candidates.push(hint);
  }
  candidates.sort((left, right) => (
    left.pageNumber - right.pageNumber || left.topRatio - right.topRatio
  ));

  const starts: QuestionStart[] = [];
  const byNumber = new Map<number, QuestionStart>();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const previous = starts[starts.length - 1];
    let resolvedNumber = candidate.detectedNumber;

    // Tesseract commonly reads a trailing zero as nine in Japanese headings:
    // 問10 -> 問19, 問20 -> 問29, and so on. Accepting that jump makes all of
    // the following correctly read questions look out of order. The physical
    // sequence gives us a safe correction signal: the previous question is 9,
    // the current OCR value is 19, and the next heading is 11.
    const expectedNumber = (previous?.number ?? 0) + 1;
    const nextDetectedNumber = candidates[index + 1]?.detectedNumber;
    const isTrailingZeroReadAsNine = expectedNumber % 10 === 0
      && candidate.detectedNumber === expectedNumber + 9
      && (nextDetectedNumber === expectedNumber + 1 || nextDetectedNumber === undefined);
    if (isTrailingZeroReadAsNine) resolvedNumber = expectedNumber;

    // A heavily blurred final "100" can be recognized as values such as
    // "196". When questions 1-99 are already contiguous, a final value above
    // the supported 100-question range cannot be a real heading in the exam
    // types handled by this importer, so recover it from physical order.
    const isFinalQuestionReadOutOfRange = repairForwardJumps
      && Boolean(previous)
      && nextDetectedNumber === undefined
      && expectedNumber === 100
      && candidate.detectedNumber > 100;
    if (isFinalQuestionReadOutOfRange) resolvedNumber = expectedNumber;

    // A duplicated or inserted digit can turn a normal heading into 341 or
    // 388. If the following physical heading is exactly the next expected
    // question, the surrounding sequence safely identifies the real number.
    const isQuestionReadOutOfRange = repairForwardJumps
      && Boolean(previous)
      && candidate.detectedNumber > 200
      && nextDetectedNumber === expectedNumber + 1;
    if (isQuestionReadOutOfRange) resolvedNumber = expectedNumber;

    // Only repair a forward jump when the remaining headings prove that it is
    // an OCR digit error. For example, if question 20 is read as 26, the later
    // headings still contain 21-26 (including a second 26). A jump from 35 to
    // a single 37 instead means question 36 was missed; renumbering that 37
    // would shift every remaining crop by one.
    const laterDetectedNumbers = new Set(
      candidates.slice(index + 1).map(next => next.detectedNumber),
    );
    const interveningNumbersRemain = Array.from(
      { length: Math.max(0, candidate.detectedNumber - expectedNumber - 1) },
      (_, offset) => expectedNumber + offset + 1,
    ).every(number => laterDetectedNumbers.has(number));
    const nextContinuesExpectedSequence = nextDetectedNumber === expectedNumber + 1;
    const isForwardJumpCorrected = repairForwardJumps
      && Boolean(previous)
      && candidate.detectedNumber > expectedNumber
      && candidate.detectedNumber <= 200
      && nextDetectedNumber !== expectedNumber
      && laterDetectedNumbers.has(candidate.detectedNumber)
      && (nextContinuesExpectedSequence || interveningNumbersRemain);
    if (isForwardJumpCorrected) resolvedNumber = expectedNumber;

    // Keep large OCR values available as sequence evidence, but never emit
    // them as actual questions unless the sequence correction above proved a
    // supported number.
    if (resolvedNumber > 200) continue;

    const duplicate = byNumber.get(resolvedNumber);
    if (duplicate) {
      duplicate.warnings.push(`Question ${resolvedNumber} was detected more than once; review its crop.`);
      continue;
    }

    if (previous && resolvedNumber <= previous.number) {
      previous.warnings.push(`Ignored out-of-order question heading ${candidate.detectedNumber}; review question segmentation.`);
      continue;
    }

    if (previous && resolvedNumber > previous.number + 1) {
      const nextNumber = candidates.slice(index + 1).find(next => next.detectedNumber > previous.number)?.detectedNumber;
      if (nextNumber === previous.number + 1) {
        previous.warnings.push(`Ignored likely false-positive question heading ${candidate.detectedNumber}.`);
        continue;
      }
      const firstMissing = previous.number + 1;
      const lastMissing = resolvedNumber - 1;
      candidate.warnings.push(
        firstMissing === lastMissing
          ? `Question ${firstMissing} was not detected before this question; review segmentation.`
          : `Questions ${firstMissing}-${lastMissing} were not detected before this question; review segmentation.`,
      );
    } else if (!previous && resolvedNumber > 1) {
      candidate.warnings.push(
        resolvedNumber === 2
          ? 'Question 1 was not detected before this question; review segmentation.'
          : `Questions 1-${resolvedNumber - 1} were not detected before this question; review segmentation.`,
      );
    }

    if (isTrailingZeroReadAsNine) {
      candidate.warnings.push(
        `OCR read question ${expectedNumber} as ${candidate.detectedNumber}; the number was corrected from its sequence.`,
      );
    } else if (isFinalQuestionReadOutOfRange) {
      candidate.warnings.push(
        `OCR read question ${expectedNumber} as ${candidate.detectedNumber}; the final number was corrected from its physical order.`,
      );
    } else if (isQuestionReadOutOfRange) {
      candidate.warnings.push(
        `OCR read question ${expectedNumber} as ${candidate.detectedNumber}; the number was corrected from its physical order.`,
      );
    } else if (isForwardJumpCorrected) {
      candidate.warnings.push(
        `OCR read question ${expectedNumber} as ${candidate.detectedNumber}; the number was corrected from its physical order.`,
      );
    }

    const start: QuestionStart = {
      number: resolvedNumber,
      pageNumber: candidate.pageNumber,
      topRatio: candidate.topRatio,
      warnings: candidate.warnings,
    };
    starts.push(start);
    byNumber.set(start.number, start);
  }
  return starts;
}

export function getQuestionHeadingRetryPages(starts: QuestionStart[]) {
  const pageNumbers = new Set<number>();
  for (let index = 1; index < starts.length; index += 1) {
    const previous = starts[index - 1];
    const current = starts[index];
    if (current.number <= previous.number + 1) continue;
    for (let pageNumber = previous.pageNumber; pageNumber <= current.pageNumber; pageNumber += 1) {
      pageNumbers.add(pageNumber);
    }
  }
  return [...pageNumbers].sort((left, right) => left - right);
}

export function getMissingExpectedQuestionNumbers(
  starts: readonly Pick<QuestionStart, 'number'>[],
  expectedCount: number,
) {
  const detected = new Set(starts.map(start => start.number));
  return Array.from(
    { length: expectedCount },
    (_, index) => index + 1,
  ).filter(number => !detected.has(number));
}

function hasCompleteExpectedSequence(starts: QuestionStart[], expectedCount: number) {
  return starts.length === expectedCount
    && starts.every((start, index) => start.number === index + 1);
}

function mergeOcrPages(primary: OcrPage[], additional: OcrPage[]) {
  const additionalByPage = new Map(additional.map(page => [page.pageNumber, page.lines]));
  return primary.map(page => ({
    ...page,
    lines: [...page.lines, ...(additionalByPage.get(page.pageNumber) ?? [])],
  }));
}

export function mergeExpectedAnswerMaps(
  expectedNumbers: Iterable<number>,
  textLayerAnswers: ReadonlyMap<number, string>,
  ocrAnswers: ReadonlyMap<number, string> = new Map(),
) {
  const expected = new Set(expectedNumbers);
  const answers = new Map<number, string>();
  for (const [number, label] of textLayerAnswers) {
    if (expected.has(number) && ANSWER_LABELS.includes(label)) answers.set(number, label);
  }
  for (const [number, label] of ocrAnswers) {
    if (expected.has(number) && !answers.has(number) && ANSWER_LABELS.includes(label)) {
      answers.set(number, label);
    }
  }
  const missingNumbers = [...expected].filter(number => !answers.has(number));
  return { answers, missingNumbers, answerCount: answers.size };
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
  options: {
    pageNumbers?: readonly number[];
    scale?: number;
    stripRatio?: number;
  } = {},
) {
  const pages: OcrPage[] = [];
  const pageNumbers = options.pageNumbers
    ?? Array.from({ length: documentProxy.numPages }, (_, index) => index + 1);
  for (const pageNumber of pageNumbers) {
    onProgress?.(`OCR: finding questions on page ${pageNumber} of ${documentProxy.numPages}…`);
    // Question numbers are a small part of a full page. At 1.8x Tesseract
    // frequently confused digits (especially 0/6/9) or missed the heading
    // entirely, which then shifted answer matching for every later question.
    // Render the narrow heading strip at a higher resolution while still
    // releasing each page before moving to the next one.
    const pageCanvas = await renderPage(documentProxy, pageNumber, options.scale ?? 2.6);
    const stripWidth = Math.floor(pageCanvas.width * (options.stripRatio ?? 0.36));
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
        tessedit_pageseg_mode: pageSegmentationModes.SINGLE_LINE,
        tessedit_char_whitelist: `0123456789${ANSWER_LABELS}`,
      });
      for (const table of grid.tables) {
        for (let rowIndex = 0; rowIndex < grid.rowCount; rowIndex += 1) {
          // Read the printed question number and answer together. Positional
          // numbering made one skipped/header row shift every later answer and
          // leave the final question empty.
          const left = table[0] + 4;
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
          const answer = parseAnswerGridRow(result.data.text);
          if (answer) {
            lines.push({
              text: `問 ${answer.number} ${answer.label}`,
              topRatio: top / canvas.height,
              bottomRatio: bottom / canvas.height,
            });
          }
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

function renderQuestionCrop(
  page: HTMLCanvasElement,
  start: QuestionStart,
  next: QuestionStart | undefined,
) {
  const topRatio = Math.max(0, start.topRatio - 0.025);
  const bottomRatio = next?.pageNumber === start.pageNumber
    ? Math.max(topRatio + 0.08, next.topRatio - 0.02)
    : 0.935;
  const top = Math.floor(page.height * topRatio);
  const bottom = Math.min(page.height, Math.ceil(page.height * bottomRatio));
  const cropped = cropCanvas(page, 0, top, page.width, bottom - top);
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
  expectedQuestionCount?: number,
): Promise<PdfImportResult> {
  onProgress?.('Starting Japanese OCR…');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const headingPages = await ocrQuestionHeadings(questionDocument, worker, onProgress);
    let combinedHeadingPages = headingPages;
    let starts = findQuestionStarts(combinedHeadingPages, true);
    const retryPageNumbers = getQuestionHeadingRetryPages(starts);
    if (retryPageNumbers.length > 0) {
      // AUTO segmentation can occasionally merge a section divider and its
      // first question or omit a small heading. Retry only pages around an
      // observed numbering gap with a larger image and sparse-text layout.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const retryPages = await ocrQuestionHeadings(questionDocument, worker, onProgress, {
        pageNumbers: retryPageNumbers,
        scale: 3.4,
        stripRatio: 0.55,
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      combinedHeadingPages = mergeOcrPages(combinedHeadingPages, retryPages);
      starts = findQuestionStarts(combinedHeadingPages, true);
    }
    if (expectedQuestionCount && !hasCompleteExpectedSequence(starts, expectedQuestionCount)) {
      onProgress?.(
        `OCR found ${starts.length} of ${expectedQuestionCount} expected questions; rereading the full PDF…`,
      );
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const fullRetryPages = await ocrQuestionHeadings(questionDocument, worker, onProgress, {
        pageNumbers: Array.from(
          { length: questionDocument.numPages },
          (_, index) => index + 1,
        ),
        scale: 3.4,
        stripRatio: 0.55,
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      combinedHeadingPages = mergeOcrPages(combinedHeadingPages, fullRetryPages);
      starts = findQuestionStarts(combinedHeadingPages, true);
    }
    if (expectedQuestionCount && !hasCompleteExpectedSequence(starts, expectedQuestionCount)) {
      const missing = getMissingExpectedQuestionNumbers(starts, expectedQuestionCount);
      const missingMessage = missing.length
        ? ` Missing question numbers: ${missing.join(', ')}.`
        : '';
      throw new Error(
        `IT Passport imports must contain questions 1-${expectedQuestionCount}. OCR found ${starts.length}.${missingMessage}`,
      );
    }
    if (!starts.length) {
      throw new Error('This scanned PDF could not be segmented into questions. Make sure the pages show headings such as “問1”.');
    }

    const expectedNumbers = starts.map(start => start.number);
    let answerResult = mergeExpectedAnswerMaps(expectedNumbers, new Map());
    if (answerDocument) {
      // An exam can have scanned question pages and a searchable answer PDF.
      // Prefer its exact text layer over OCR, which is less reliable for dense grids.
      onProgress?.('Reading embedded answer text…');
      const textLayerAnswers = extractAnswerMap(await extractPages(answerDocument));
      answerResult = mergeExpectedAnswerMaps(expectedNumbers, textLayerAnswers);

      if (answerResult.missingNumbers.length > 0) {
        onProgress?.(`OCR: looking for ${answerResult.missingNumbers.length} missing answers…`);
        const ocrAnswers = extractAnswers(await ocrAnswerPages(answerDocument, worker, PSM, onProgress));
        answerResult = mergeExpectedAnswerMaps(expectedNumbers, textLayerAnswers, ocrAnswers);
      }
    }

    const questions: PdfImportQuestion[] = [];
    let renderedQuestionPage: HTMLCanvasElement | null = null;
    let renderedQuestionPageNumber = 0;
    try {
      for (let index = 0; index < starts.length; index += 1) {
        const start = starts[index];
        const next = starts[index + 1];
        if (!renderedQuestionPage || renderedQuestionPageNumber !== start.pageNumber) {
          if (renderedQuestionPage) {
            renderedQuestionPage.width = 1;
            renderedQuestionPage.height = 1;
          }
          // Several questions commonly share one PDF page. Render that page
          // once and reuse it for every crop instead of decoding it repeatedly.
          renderedQuestionPage = await renderPage(questionDocument, start.pageNumber, 1.65);
          renderedQuestionPageNumber = start.pageNumber;
        }
        onProgress?.(`Preparing question ${index + 1} of ${starts.length}…`);
        const correctChoice = answerResult.answers.get(start.number) ?? '';
        questions.push({
          sourceKey: `${examKey}:Q${start.number}`,
          number: start.number,
          questionText: `${examKey} 問${start.number}`,
          imageDataUrl: renderQuestionCrop(renderedQuestionPage, start, next),
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
          warnings: [
            ...start.warnings,
            ...(correctChoice ? [] : ['Correct answer not detected. Select it below.']),
          ],
        });
      }
    } finally {
      if (renderedQuestionPage) {
        renderedQuestionPage.width = 1;
        renderedQuestionPage.height = 1;
      }
    }
    return { questions, answerCount: answerResult.answerCount };
  } finally {
    await worker.terminate();
  }
}
