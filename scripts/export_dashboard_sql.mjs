import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_DIR = resolve(ROOT, 'supabase', 'import');

const REQUIRED_SUBJECTS_SQL = `INSERT INTO public.subjects (id, name, description, color)
VALUES
  ('aa000000-0000-0000-0000-000000000001', '基本情報技術者 科目A', '基本情報技術者試験 科目A', '#3B82F6'),
  ('cc000001-0000-0000-0000-000000000001', 'ストラテジ系', '経営戦略・IT戦略・法務・企業活動・マーケティング', '#3B82F6'),
  ('cc000002-0000-0000-0000-000000000001', 'マネジメント系', 'プロジェクトマネジメント・サービスマネジメント・システム開発・システム監査', '#10B981'),
  ('cc000003-0000-0000-0000-000000000001', 'テクノロジ系', 'ハードウェア・ソフトウェア・ネットワーク・データベース・セキュリティ・アルゴリズム', '#F59E0B')
ON CONFLICT (id) DO NOTHING;`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function sqlValue(value) {
  if (value === '') return 'NULL';
  return `'${value.replaceAll("'", "''")}'`;
}

function csvToInsertSql(csvFilename, tableName) {
  const parsed = parseCsv(readFileSync(resolve(IMPORT_DIR, csvFilename), 'utf8'));
  const [columns, ...rows] = parsed;
  const statements = [];

  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200);
    const values = batch
      .map(row => `  (${row.map(sqlValue).join(', ')})`)
      .join(',\n');
    statements.push(
      `INSERT INTO public.${tableName} (${columns.join(', ')})\nVALUES\n${values}\nON CONFLICT (id) DO NOTHING;`,
    );
  }

  return [
    'BEGIN;',
    ...(tableName === 'questions' ? [REQUIRED_SUBJECTS_SQL] : []),
    ...statements,
    'COMMIT;',
    '',
    `SELECT COUNT(*) AS ${tableName}_total FROM public.${tableName};`,
    '',
  ].join('\n\n');
}

writeFileSync(
  resolve(IMPORT_DIR, '01_questions.sql'),
  csvToInsertSql('questions.csv', 'questions'),
  'utf8',
);
writeFileSync(
  resolve(IMPORT_DIR, '02_answer_choices.sql'),
  csvToInsertSql('answer_choices.csv', 'answer_choices'),
  'utf8',
);

console.log('Created dashboard SQL repair files in supabase/import');
