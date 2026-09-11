import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PageText {
  pageNumber: number;
  text: string;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

function normalize(value: string) {
  return value.normalize('NFKC').split('\u3000').join(' ');
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

export async function extractPages(document: PDFDocumentProxy): Promise<PageText[]> {
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

export function extractAnswerMap(pages: PageText[]) {
  const answers = new Map<number, string>();
  const labels = 'アイウエオカキクケコ';
  const directPattern = new RegExp(
    `問\\s*(\\d{1,3})\\s*(?:[:：=\\-]\\s*)?([${labels}])(?=\\s|問|$)`,
    'g',
  );
  const standaloneLabelPattern = new RegExp(`(?<!\\S)([${labels}])(?!\\S)`, 'g');

  for (const page of pages) {
    const text = normalize(page.text);
    for (const match of text.matchAll(directPattern)) answers.set(Number(match[1]), match[2]);

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const numbers = [...lines[index].matchAll(/問\s*(\d{1,3})/g)].map(match => Number(match[1]));
      if (!numbers.length) continue;
      for (const answerLine of lines.slice(index + 1, index + 4)) {
        const answerLabels = [...answerLine.matchAll(standaloneLabelPattern)].map(match => match[1]);
        if (answerLabels.length === numbers.length) {
          numbers.forEach((number, answerIndex) => answers.set(number, answerLabels[answerIndex]));
          break;
        }
      }
    }
  }
  return answers;
}
