export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.');

  const headers = rows[0].map(header => header.replace(/^\uFEFF/, '').trim());
  if (headers.some(header => !header)) throw new Error('CSV contains an empty column name.');

  return rows.slice(1).map(values => Object.fromEntries(
    headers.map((header, index) => [header, (values[index] ?? '').trim()]),
  ));
}

export async function readCsvFile(file: File) {
  return parseCsv(await file.text());
}
