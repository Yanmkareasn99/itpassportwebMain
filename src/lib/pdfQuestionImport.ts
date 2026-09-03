import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfImportChoice {
  label: string;
  text: string;
  sortOrder: number;
}

export interface PdfImportQuestion {
  sourceKey: string;
  number: number;
  questionText: string;
  imageDataUrl: string;
  sourcePages: number[];
  choices: PdfImportChoice[];
  correctChoice: string;
  explanation: string;
  difficulty: number;
  points: number;
  warnings: string[];
}

export interface PdfImportResult {
  questions: PdfImportQuestion[];
  answerCount: number;
}

interface PageText {
  pageNumber: number;
  text: string;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

const CHOICE_LABELS = 'アイウエオカキクケコ';
const MEMO_MARKERS = ['メモ用紙', 'メ モ 用 紙'];
const TRAILING_MARKERS = ['試験問題に記載されている会社名', '無断転載を禁ず'];

function normalize(value: string) {
  return value.normalize('NFKC').split('\u3000').join(' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textContentToLines(items: PdfTextItem[]) {
  const positioned = items
    .filter(item => item.str.trim())
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
    }))
    .sort((left, right) => Math.abs(right.y - left.y) > 2.5 ? right.y - left.y : left.x - right.x);

  const lines: typeof positioned[] = [];
  for (const item of positioned) {
    const line = lines.find(candidate => Math.abs(candidate[0].y - item.y) <= 2.5);
    if (line) line.push(item);
    else lines.push([item]);
  }

  return lines
    .sort((left, right) => right[0].y - left[0].y)
    .map(line => {
      const sorted = line.sort((left, right) => left.x - right.x);
      let value = '';
      let previousRight: number | null = null;
      for (const item of sorted) {
        const gap = previousRight === null ? 0 : item.x - previousRight;
        if (value && gap > 5 && !/\s$/.test(value)) value += ' ';
        value += item.text;
        previousRight = item.x + item.width;
      }
      return value.trim();
    })
    .filter(Boolean)
    .join('\n');
}

async function extractPages(document: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter(item => 'str' in item) as PdfTextItem[];
    pages.push({ pageNumber, text: textContentToLines(items) });
    page.cleanup();
  }
  return pages;
}

function cleanPdfText(value: string) {
  const lines: string[] = [];
  for (const rawLine of value.split('\r').join('').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    if (/^[－—-]?\s*\d+\s*[－—-]?$/.test(normalize(line))) continue;
    lines.push(line);
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function findQuestionStarts(pages: PageText[]) {
  const starts: { number: number; pageIndex: number }[] = [];
  const seen = new Set<number>();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const text = normalize(pages[pageIndex].text);
    if (text.includes('問題番号') && text.includes('注意事項')) continue;
    const match = text.match(/(?:^|\n)\s*問\s*(\d{1,3})(?=\s)/);
    if (!match) continue;
    const number = Number(match[1]);
    if (!seen.has(number)) {
      starts.push({ number, pageIndex });
      seen.add(number);
    }
  }
  return starts;
}

function parseChoices(text: string): PdfImportChoice[] {
  const normalizedText = normalize(text);
  const marker = normalizedText.indexOf('解答群');
  if (marker < 0) return [];
  const group = normalizedText.slice(marker + '解答群'.length);
  const labelPattern = new RegExp(`^\\s*([${escapeRegExp(CHOICE_LABELS)}])(?:\\s+(.+))?\\s*$`);
  const choices: PdfImportChoice[] = [];
  let current: { label: string; parts: string[] } | null = null;

  for (const rawLine of group.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(labelPattern);
    if (match) {
      if (current) {
        choices.push({
          label: current.label,
          text: current.parts.join(' ').trim() || current.label,
          sortOrder: choices.length + 1,
        });
      }
      current = { label: match[1], parts: [match[2] ?? ''] };
    } else if (current) {
      current.parts.push(line);
    }
  }
  if (current) {
    choices.push({
      label: current.label,
      text: current.parts.join(' ').trim() || current.label,
      sortOrder: choices.length + 1,
    });
  }

  return choices.filter((choice, index) =>
    choices.findIndex(candidate => candidate.label === choice.label) === index,
  );
}

function extractAnswerMap(pages: PageText[]) {
  const answers = new Map<number, string>();
  const labelClass = escapeRegExp(CHOICE_LABELS);
  const directPattern = new RegExp(
    `問\\s*(\\d{1,3})\\s*(?:[:：=\\-]\\s*)?([${labelClass}])(?=\\s|$)`,
    'g',
  );
  const standaloneLabelPattern = new RegExp(`(?<!\\S)([${labelClass}])(?!\\S)`, 'g');

  for (const page of pages) {
    const text = normalize(page.text);
    for (const match of text.matchAll(directPattern)) answers.set(Number(match[1]), match[2]);

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const numbers = [...lines[index].matchAll(/問\s*(\d{1,3})/g)].map(match => Number(match[1]));
      if (!numbers.length) continue;
      for (const answerLine of lines.slice(index + 1, index + 4)) {
        const labels = [...answerLine.matchAll(standaloneLabelPattern)].map(match => match[1]);
        if (labels.length === numbers.length) {
          numbers.forEach((number, answerIndex) => answers.set(number, labels[answerIndex]));
          break;
        }
      }
    }
  }
  return answers;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function trimCanvas(source: HTMLCanvasElement) {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  const scanHeight = Math.max(1, Math.floor(source.height * 0.935));
  const pixels = context.getImageData(0, 0, source.width, scanHeight).data;
  let left = source.width;
  let right = 0;
  let top = scanHeight;
  let bottom = 0;
  for (let y = 0; y < scanHeight; y += 2) {
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
  const margin = Math.max(18, Math.floor(source.width / 60));
  const cropLeft = Math.max(0, left - margin);
  const cropTop = Math.max(0, top - margin);
  const cropRight = Math.min(source.width, right + margin);
  const cropBottom = Math.min(scanHeight, bottom + margin);
  const output = createCanvas(cropRight - cropLeft, cropBottom - cropTop);
  output.getContext('2d')?.drawImage(
    source,
    cropLeft,
    cropTop,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height,
  );
  return output;
}

async function renderQuestionImage(document: PDFDocumentProxy, pageNumbers: number[]) {
  const rendered: HTMLCanvasElement[] = [];
  for (const pageNumber of pageNumbers) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.45 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    rendered.push(trimCanvas(canvas));
    page.cleanup();
  }

  const width = Math.max(...rendered.map(canvas => canvas.width));
  const gap = Math.max(16, Math.floor(width / 70));
  const height = rendered.reduce((sum, canvas) => sum + canvas.height, 0) + gap * (rendered.length - 1);
  const combined = createCanvas(width, height);
  const context = combined.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  let top = 0;
  for (const canvas of rendered) {
    context.drawImage(canvas, Math.floor((width - canvas.width) / 2), top);
    top += canvas.height + gap;
  }
  return combined.toDataURL('image/webp', 0.82);
}

async function openPdf(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return getDocument({ data: bytes }).promise;
}

export async function processExamPdfs(
  questionFile: File,
  answerFile: File | null,
  examKey: string,
  onProgress?: (message: string) => void,
): Promise<PdfImportResult> {
  const questionDocument = await openPdf(questionFile);
  const answerDocument = answerFile ? await openPdf(answerFile) : null;
  try {
    onProgress?.('Reading question text…');
    const questionPages = await extractPages(questionDocument);
    const starts = findQuestionStarts(questionPages);
    if (!starts.length) throw new Error('No question headings such as “問1” were found in the PDF.');

    let answers = new Map<number, string>();
    if (answerDocument) {
      onProgress?.('Reading the answer key…');
      answers = extractAnswerMap(await extractPages(answerDocument));
    }

    const questions: PdfImportQuestion[] = [];
    for (let position = 0; position < starts.length; position += 1) {
      const start = starts[position];
      const endIndex = starts[position + 1]?.pageIndex ?? questionPages.length;
      const pages = questionPages.slice(start.pageIndex, endIndex).filter((page, pageOffset) => {
        const text = normalize(page.text);
        if (MEMO_MARKERS.some(marker => text.includes(marker))) return false;
        if (TRAILING_MARKERS.some(marker => text.includes(marker))) return false;
        return pageOffset === 0 || cleanPdfText(text).length >= 80;
      });
      if (!pages.length) continue;

      onProgress?.(`Rendering question ${position + 1} of ${starts.length}…`);
      const combinedText = cleanPdfText(pages.map(page => page.text).join('\n'));
      const answerGroupAt = normalize(combinedText).indexOf('解答群');
      const questionText = answerGroupAt >= 0
        ? combinedText.slice(0, answerGroupAt).trim()
        : combinedText.trim();
      const choices = parseChoices(combinedText);
      const correctChoice = answers.get(start.number) ?? '';
      if (correctChoice && !choices.some(choice => choice.label === correctChoice)) {
        choices.push({ label: correctChoice, text: correctChoice, sortOrder: choices.length + 1 });
      }
      const warnings: string[] = [];
      if (!correctChoice) warnings.push('Correct answer not detected. Select it below.');
      if (choices.length < 2) warnings.push('Fewer than two choices were detected. Add or edit choices below.');

      questions.push({
        sourceKey: `${examKey}:Q${start.number}`,
        number: start.number,
        questionText: questionText || `${examKey} 問${start.number}`,
        imageDataUrl: await renderQuestionImage(questionDocument, pages.map(page => page.pageNumber)),
        sourcePages: pages.map(page => page.pageNumber),
        choices,
        correctChoice,
        explanation: '',
        difficulty: 2,
        points: 1,
        warnings,
      });
    }
    return { questions, answerCount: answers.size };
  } finally {
    questionDocument.destroy();
    answerDocument?.destroy();
  }
}
