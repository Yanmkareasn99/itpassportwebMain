import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const inline = args.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const sourceDir = resolve(argument('source-dir', resolve(projectRoot, '..', 'it-passport-learning-main', 'data', 'ip', 'quiz')));
const outputDir = resolve(argument('output-dir', resolve(projectRoot, 'supabase', 'import', 'ip-quiz-v1')));
const sourceFiguresDir = resolve(argument(
  'figures-dir',
  resolve(sourceDir, '..', '..', '..', 'apps', 'web', 'public', 'quiz-figures'),
));
const outputFiguresDir = resolve(projectRoot, 'public', 'quiz-figures');

const SUBJECT_IDS = {
  strategy: 'cc000001-0000-0000-0000-000000000001',
  management: 'cc000002-0000-0000-0000-000000000001',
  technology: 'cc000003-0000-0000-0000-000000000001',
};
const CHOICE_FILE_LABELS = ['A', 'B', 'C', 'D'];

function readJson(filename) {
  const path = resolve(sourceDir, filename);
  if (!existsSync(path)) throw new Error(`Missing source file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stableUuid(value) {
  const bytes = createHash('sha256').update(`manabi:quiz-v1:${value}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replaceAll('"', '""')}"`;
}

function toCsv(rows, columns) {
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(',')),
  ].join('\r\n');
}

function questionNumber(question) {
  const match = /-q(\d+)$/i.exec(question.id);
  if (!match) throw new Error(`Unable to read the question number from ${question.id}`);
  return Number(match[1]);
}

function examDate(exam) {
  const month = exam.season === '春期' ? '04' : exam.season === '秋期' ? '10' : '01';
  return `${exam.gregorian}-${month}-01`;
}

function normalizedQuestionText(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\u3000\u200B-\u200D\uFEFF]+/gu, '')
    .trim();
}

const questionData = readJson('questions.json');
const indexData = readJson('quiz_index.json');
const groupData = readJson('chumon_groups.json');

if (questionData.schema_version !== 'quiz-v1' || !Array.isArray(questionData.questions)) {
  throw new Error('questions.json is not a quiz-v1 question file.');
}
if (!Array.isArray(indexData.exams)) throw new Error('quiz_index.json has no exams array.');
if (!Array.isArray(groupData.groups)) throw new Error('chumon_groups.json has no groups array.');

const exams = new Map(indexData.exams.map(exam => [exam.exam_id, exam]));
const sourceIds = new Set(questionData.questions.map(question => question.id));
if (sourceIds.size !== questionData.questions.length) throw new Error('questions.json contains duplicate question IDs.');
for (const question of questionData.questions) {
  if (!exams.has(question.exam_id)) throw new Error(`Unknown exam on ${question.id}: ${question.exam_id}`);
}

const missingGroupMembers = groupData.groups.flatMap(group => (
  group.member_ids.filter(id => !sourceIds.has(id)).map(id => `${group.key}:${id}`)
));
if (missingGroupMembers.length > 0) {
  throw new Error(`chumon_groups.json contains unknown question IDs: ${missingGroupMembers.slice(0, 10).join(', ')}`);
}

// Match the database's duplicate-question rule. When an exam repeats a stem,
// retain the newest occurrence and its corresponding choices/answer.
const canonicalByText = new Map();
for (const question of questionData.questions) {
  const key = normalizedQuestionText(question.stem_jp.trim());
  const existing = canonicalByText.get(key);
  const currentDate = examDate(exams.get(question.exam_id));
  if (!existing || currentDate >= examDate(exams.get(existing.exam_id))) {
    canonicalByText.set(key, question);
  }
}
const canonicalQuestions = [...canonicalByText.values()];
const duplicateCount = questionData.questions.length - canonicalQuestions.length;

const availableFigures = existsSync(sourceFiguresDir)
  ? new Set(readdirSync(sourceFiguresDir))
  : new Set();
const referencedFigures = new Set();
const questionRows = [];
const choiceRows = [];

for (const question of canonicalQuestions) {
  const subjectId = SUBJECT_IDS[question.category];
  if (!subjectId) throw new Error(`Unknown category on ${question.id}: ${question.category}`);
  const exam = exams.get(question.exam_id);
  if (!exam) throw new Error(`Unknown exam on ${question.id}: ${question.exam_id}`);
  const labels = Object.keys(question.choices_jp ?? {});
  if (labels.length < 2 || !labels.includes(question.correct_answer)) {
    throw new Error(`${question.id} must have at least two choices and exactly one valid answer.`);
  }

  const id = stableUuid(question.id);
  const mainFigure = question.figure ? `${question.figure}.webp` : null;
  const imageUrl = mainFigure && availableFigures.has(mainFigure)
    ? `/quiz-figures/${mainFigure}`
    : null;
  if (imageUrl) referencedFigures.add(mainFigure);

  questionRows.push({
    id,
    source_key: `ip-quiz-v1:${question.id}`,
    exam_date: examDate(exam),
    subject_id: subjectId,
    question_number: questionNumber(question),
    question_text: question.stem_jp.trim(),
    question_type: 'multiple_choice',
    image_url: imageUrl,
    explanation: null,
    difficulty: 2,
    points: 1,
    explanation_ja: null,
    explanation_en: null,
    explanation_vi: null,
  });

  labels.forEach((label, index) => {
    const choiceFigure = `${question.id}-c${CHOICE_FILE_LABELS[index]}.webp`;
    const choiceImageUrl = availableFigures.has(choiceFigure)
      ? `/quiz-figures/${choiceFigure}`
      : null;
    if (choiceImageUrl) referencedFigures.add(choiceFigure);
    choiceRows.push({
      id: stableUuid(`${question.id}:choice:${label}`),
      question_id: id,
      choice_text: `${label}：${String(question.choices_jp[label]).trim()}`,
      image_url: choiceImageUrl,
      is_correct: label === question.correct_answer,
      sort_order: index + 1,
    });
  });
}

const correctCounts = new Map(questionRows.map(question => [question.id, 0]));
for (const choice of choiceRows) {
  if (choice.is_correct) correctCounts.set(choice.question_id, correctCounts.get(choice.question_id) + 1);
}
const invalidAnswers = [...correctCounts].filter(([, count]) => count !== 1);
if (invalidAnswers.length > 0) throw new Error(`${invalidAnswers.length} converted questions do not have exactly one answer.`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'questions.csv'), toCsv(questionRows, [
  'id', 'source_key', 'exam_date', 'subject_id', 'question_number', 'question_text',
  'question_type', 'image_url', 'explanation', 'difficulty', 'points',
  'explanation_ja', 'explanation_en', 'explanation_vi',
]), 'utf8');
writeFileSync(resolve(outputDir, 'answer_choices.csv'), toCsv(choiceRows, [
  'id', 'question_id', 'choice_text', 'image_url', 'is_correct', 'sort_order',
]), 'utf8');

if (referencedFigures.size > 0) {
  mkdirSync(outputFiguresDir, { recursive: true });
  for (const filename of referencedFigures) {
    copyFileSync(resolve(sourceFiguresDir, filename), resolve(outputFiguresDir, filename));
  }
}

const missingMainFigures = canonicalQuestions.filter(question => (
  question.has_figure && question.figure && !availableFigures.has(`${question.figure}.webp`)
));

console.log(`Created ${questionRows.length} questions and ${choiceRows.length} choices in ${outputDir}`);
console.log(`Skipped ${duplicateCount} repeated question stems to satisfy the database duplicate rule`);
console.log(`Copied ${referencedFigures.size} referenced figure files to ${outputFiguresDir}`);
console.log(`Validated ${groupData.groups.length} long-question groups (${groupData.counts?.members ?? 0} members)`);
if (missingMainFigures.length > 0) {
  console.warn(`Warning: ${missingMainFigures.length} named question figures were not found.`);
}
