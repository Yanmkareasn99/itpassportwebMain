import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, 'src', 'data');
const OUTPUT_DIR = resolve(ROOT, 'supabase', 'import');

const SUBJECT_IDS = {
  '理論': 'cc000003-0000-0000-0000-000000000001',
  'ネットワーク': 'cc000003-0000-0000-0000-000000000001',
  'データベース': 'cc000003-0000-0000-0000-000000000001',
  'セキュリティ': 'cc000003-0000-0000-0000-000000000001',
  'プロジェクトマネジメント': 'cc000002-0000-0000-0000-000000000001',
  'アルゴリズム': 'cc000003-0000-0000-0000-000000000001',
  'テクノロジ': 'cc000003-0000-0000-0000-000000000001',
  'マネジメント': 'cc000002-0000-0000-0000-000000000001',
  'ストラテジ': 'cc000001-0000-0000-0000-000000000001',
  kakomon_A: 'aa000000-0000-0000-0000-000000000001',
  kakomon_S: 'aa000000-0000-0000-0000-000000000001',
};

const OPTION_KEYS = ['ア', 'イ', 'ウ', 'エ'];
const questionRows = [];
const choiceRows = [];
const questionTexts = new Set();

function readJson(filename) {
  return JSON.parse(readFileSync(resolve(DATA_DIR, filename), 'utf8'));
}

function isImagePath(value) {
  return typeof value === 'string' && value.startsWith('../');
}

function normalizeImagePath(year, subjectKey, sourcePath, questionId, choiceSuffix = '') {
  if (!isImagePath(sourcePath)) return null;
  const filename = sourcePath.replaceAll('\\', '/').split('/').pop();
  if (!filename) return null;
  const value = String(year);
  const folder = subjectKey === 'kakomon_A'
    ? (value.toLowerCase() === 'sample' ? 'sampleA' : `${value}A`)
    : `${value}S`;
  const id = String(questionId ?? '');
  const candidates = [
    filename,
    `${id}${choiceSuffix}.png`,
    `${id.padStart(2, '0')}${choiceSuffix}.png`,
    `${value}Q${id}${choiceSuffix}.png`,
    `${value}Q${id.padStart(2, '0')}${choiceSuffix}.png`,
  ];
  const found = candidates.find(candidate => existsSync(resolve(DATA_DIR, 'img', folder, candidate)));
  return found ? `img/${folder}/${found}` : null;
}

function addQuestion({
  subjectId,
  number,
  text,
  options,
  correctAnswer,
  explanation = null,
  explanationJa = null,
  explanationEn = null,
  explanationVi = null,
  imageUrl = null,
}) {
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText || questionTexts.has(cleanText) || options.length === 0) return;

  const validOptions = options.filter(option => option.text || option.imageUrl);
  if (validOptions.length === 0) return;
  const questionId = randomUUID();

  questionRows.push({
    id: questionId,
    subject_id: subjectId,
    question_number: number,
    question_text: cleanText,
    question_type: 'multiple_choice',
    image_url: imageUrl,
    explanation,
    difficulty: 2,
    points: 1,
    explanation_ja: explanationJa ?? explanation,
    explanation_en: explanationEn,
    explanation_vi: explanationVi,
  });

  validOptions.forEach((option, index) => {
    choiceRows.push({
      id: randomUUID(),
      question_id: questionId,
      choice_text: option.text || option.key,
      image_url: option.imageUrl ?? null,
      is_correct: option.key === correctAnswer || option.text === correctAnswer,
      sort_order: index + 1,
    });
  });
  questionTexts.add(cleanText);
}

const categoryQuestions = readJson('category_questions.json');
for (const [category, questions] of Object.entries(categoryQuestions)) {
  const subjectId = SUBJECT_IDS[category];
  if (!subjectId) continue;
  questions.forEach((question, index) => {
    if (!Array.isArray(question.options)) return;
    addQuestion({
      subjectId,
      number: index + 1,
      text: question.question,
      options: question.options.map(option => ({ text: String(option) })),
      correctAnswer: String(question.answer),
      explanation: question.explanation ?? null,
    });
  });
}

const generalQuestions = readJson('questions.json');
generalQuestions.forEach((question, index) => {
  const subjectId = SUBJECT_IDS[question.category];
  if (!subjectId || !Array.isArray(question.options)) return;
  addQuestion({
    subjectId,
    number: index + 1,
    text: question.question,
    options: question.options.map(option => ({ text: String(option) })),
    correctAnswer: String(question.answer),
    explanation: question.explanation ?? question.explanation_ja ?? null,
    explanationJa: question.explanation_ja ?? question.explanation ?? null,
    explanationEn: question.explanation_en ?? null,
    explanationVi: question.explanation_vi ?? null,
  });
});

const answers = readJson('kakomon_answers.json');
function addKakomon(filename, answerGroup, subjectKey) {
  const source = readJson(filename);
  for (const session of source.exam_data ?? []) {
    const sessionAnswers = answers[answerGroup]?.[String(session.year)] ?? {};
    for (const question of session.questions ?? []) {
      if (!question.options) continue;
      const correctAnswer = sessionAnswers[String(question.id)];
      if (!correctAnswer) continue;
      addQuestion({
        subjectId: SUBJECT_IDS[subjectKey],
        number: question.id,
        text: question.question,
        imageUrl: normalizeImagePath(session.year, subjectKey, question.image_file, question.id),
        options: OPTION_KEYS.map((key, index) => {
          const value = question.options[key];
          const optionIsImage = isImagePath(value);
          const imageUrl = normalizeImagePath(
            session.year,
            subjectKey,
            value,
            question.id,
            ['a', 'i', 'u', 'e'][index],
          );
          return {
            key,
            text: optionIsImage ? key : (value ? `${key}：${value}` : ''),
            imageUrl,
          };
        }),
        correctAnswer,
      });
    }
  }
}

addKakomon('kakomon_questionsA.json', '科目A試験', 'kakomon_A');
addKakomon('kakomon_questionsS.json', '科目A修了認定試験', 'kakomon_S');

const questionIds = new Set(questionRows.map(question => question.id));
const correctCounts = new Map(questionRows.map(question => [question.id, 0]));
for (const choice of choiceRows) {
  if (!questionIds.has(choice.question_id)) {
    throw new Error(`Answer choice refers to an unknown question: ${choice.question_id}`);
  }
  if (choice.is_correct) {
    correctCounts.set(choice.question_id, correctCounts.get(choice.question_id) + 1);
  }
}
const invalidQuestionIds = [...correctCounts]
  .filter(([, correctCount]) => correctCount !== 1)
  .map(([questionId]) => questionId);
if (invalidQuestionIds.length > 0) {
  const examples = questionRows
    .filter(question => invalidQuestionIds.includes(question.id))
    .slice(0, 3)
    .map(question => question.question_text)
    .join(' | ');
  throw new Error(`${invalidQuestionIds.length} questions do not have exactly one correct answer: ${examples}`);
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

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(
  resolve(OUTPUT_DIR, 'questions.csv'),
  toCsv(questionRows, [
    'id',
    'subject_id',
    'question_number',
    'question_text',
    'question_type',
    'image_url',
    'explanation',
    'difficulty',
    'points',
    'explanation_ja',
    'explanation_en',
    'explanation_vi',
  ]),
  'utf8',
);
writeFileSync(
  resolve(OUTPUT_DIR, 'answer_choices.csv'),
  toCsv(choiceRows, ['id', 'question_id', 'choice_text', 'image_url', 'is_correct', 'sort_order']),
  'utf8',
);

console.log(`Created ${questionRows.length} questions and ${choiceRows.length} answer choices in ${OUTPUT_DIR}`);
