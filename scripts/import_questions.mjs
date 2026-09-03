import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing questions.');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

const SUBJECT_IDS = {
  // category_questions.json categories → real subject IDs
  '理論':                    'cc000003-0000-0000-0000-000000000001', // テクノロジ系
  'ネットワーク':            'cc000003-0000-0000-0000-000000000001', // テクノロジ系
  'データベース':            'cc000003-0000-0000-0000-000000000001', // テクノロジ系
  'セキュリティ':            'cc000003-0000-0000-0000-000000000001', // テクノロジ系
  'プロジェクトマネジメント':'cc000002-0000-0000-0000-000000000001', // マネジメント系
  'アルゴリズム':            'cc000003-0000-0000-0000-000000000001', // テクノロジ系
  // questions.json categories
  'テクノロジ':              'cc000003-0000-0000-0000-000000000001',
  'マネジメント':            'cc000002-0000-0000-0000-000000000001',
  'ストラテジ':              'cc000001-0000-0000-0000-000000000001',
  // kakomon
  'kakomon_A':               'aa000000-0000-0000-0000-000000000001', // 基本情報 科目A
  'kakomon_S':               'aa000000-0000-0000-0000-000000000001', // 基本情報 科目A
};

const OPTION_KEYS = ['ア', 'イ', 'ウ', 'エ'];

async function verifySubjects() {
  const requiredIds = [...new Set(Object.values(SUBJECT_IDS))];
  const { data, error } = await supabase
    .from('subjects')
    .select('id')
    .in('id', requiredIds);

  if (error) throw new Error(`Unable to read subjects: ${error.message}`);

  const foundIds = new Set((data ?? []).map(subject => subject.id));
  const missingIds = requiredIds.filter(id => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `Required subjects are missing (${missingIds.join(', ')}). Apply the subject migrations before importing questions.`,
    );
  }
}

function isImagePath(s) {
  return typeof s === 'string' && s.startsWith('../');
}

function hasImageOptions(options) {
  if (typeof options === 'object' && !Array.isArray(options)) {
    return Object.values(options).some(isImagePath);
  }
  return false;
}

async function loadExistingTexts() {
  const existing = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('question_text')
      .range(from, from + 999);
    if (error) throw new Error(`Unable to read existing questions: ${error.message}`);
    if (!data || data.length === 0) break;
    data.forEach(q => existing.add(q.question_text.trim()));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Loaded ${existing.size} existing questions for dedup`);
  return existing;
}

async function insertBatch(questions, choices) {
  if (questions.length === 0) return 0;
  const { error } = await supabase.from('questions').insert(questions);
  if (error) throw new Error(`Question insert failed: ${error.message}`);

  for (let i = 0; i < choices.length; i += 200) {
    const { error: ce } = await supabase.from('answer_choices').insert(choices.slice(i, i + 200));
    if (ce) throw new Error(`Answer-choice insert failed: ${ce.message}`);
  }
  return questions.length;
}

async function importCategoryQuestions(existing) {
  const data = JSON.parse(readFileSync(`${BASE}/category_questions.json`, 'utf8'));
  let total = 0;

  for (const [cat, qs] of Object.entries(data)) {
    const subjectId = SUBJECT_IDS[cat];
    if (!subjectId) { console.log(`  No subject for category: ${cat} — skipping`); continue; }

    const questions = [], choices = [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const text = q.question?.trim();
      if (!text || existing.has(text)) continue;
      if (!Array.isArray(q.options) || q.options.length === 0) continue;

      const qId = randomUUID();
      questions.push({
        id: qId,
        subject_id: subjectId,
        question_number: i + 1,
        question_text: text,
        question_type: 'multiple_choice',
        explanation: q.explanation || null,
        explanation_ja: q.explanation || null,
        difficulty: 2,
        points: 1,
      });
      q.options.forEach((opt, idx) => {
        choices.push({ question_id: qId, choice_text: String(opt), is_correct: String(opt) === String(q.answer), sort_order: idx + 1 });
      });
      existing.add(text);
    }

    const n = await insertBatch(questions, choices);
    console.log(`  ${cat}: inserted ${n}`);
    total += n;
  }
  return total;
}

async function importQuestionsJson(existing) {
  const qs = JSON.parse(readFileSync(`${BASE}/questions.json`, 'utf8'));
  const questions = [], choices = [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const subjectId = SUBJECT_IDS[q.category];
    if (!subjectId) continue;
    const text = q.question?.trim();
    if (!text || existing.has(text)) continue;
    if (!Array.isArray(q.options) || q.options.length === 0) continue;

    const qId = randomUUID();
    questions.push({
      id: qId,
      subject_id: subjectId,
      question_number: i + 1,
      question_text: text,
      question_type: 'multiple_choice',
      explanation: q.explanation || q.explanation_ja || null,
      explanation_ja: q.explanation_ja || q.explanation || null,
      explanation_en: q.explanation_en || null,
      explanation_vi: q.explanation_vi || null,
      difficulty: 2,
      points: 1,
    });
    q.options.forEach((opt, idx) => {
      choices.push({ question_id: qId, choice_text: String(opt), is_correct: String(opt) === String(q.answer), sort_order: idx + 1 });
    });
    existing.add(text);
  }

  const n = await insertBatch(questions, choices);
  console.log(`  questions.json: inserted ${n}`);
  return n;
}

async function importKakomonExam(examData, answers, subjectKey, existing) {
  let total = 0;
  const subjectId = SUBJECT_IDS[subjectKey];

  for (const session of examData) {
    const yearKey = String(session.year);
    const sessionAnswers = answers?.[yearKey] ?? {};
    const questions = [], choices = [];

    for (const q of session.questions) {
      const text = q.question?.trim();
      if (!text || existing.has(text)) continue;
      if (!q.options || hasImageOptions(q.options)) continue;

      const answerLetter = sessionAnswers[String(q.id)];
      if (!answerLetter) continue;

      const qId = randomUUID();
      questions.push({ id: qId, subject_id: subjectId, question_number: q.id, question_text: text, question_type: 'multiple_choice', explanation: null, difficulty: 2, points: 1 });

      OPTION_KEYS.forEach((key, idx) => {
        const optText = q.options[key];
        if (!optText || isImagePath(optText)) return;
        choices.push({ question_id: qId, choice_text: `${key}：${optText}`, is_correct: key === answerLetter, sort_order: idx + 1 });
      });

      existing.add(text);
    }

    const n = await insertBatch(questions, choices);
    console.log(`  ${session.title}: inserted ${n}`);
    total += n;
  }
  return total;
}

async function main() {
  console.log('Checking required subjects...');
  await verifySubjects();

  console.log('Loading existing questions...');
  const existing = await loadExistingTexts();

  console.log('\n--- Importing category_questions.json ---');
  const catTotal = await importCategoryQuestions(existing);

  console.log('\n--- Importing questions.json ---');
  const qTotal = await importQuestionsJson(existing);

  console.log('\n--- Importing kakomon 科目A 公開問題 (ALL sessions) ---');
  const kakomonA = JSON.parse(readFileSync(`${BASE}/kakomon_questionsA.json`, 'utf8'));
  const answers = JSON.parse(readFileSync(`${BASE}/kakomon_answers.json`, 'utf8'));
  const aTotal = await importKakomonExam(kakomonA.exam_data, answers['科目A試験'], 'kakomon_A', existing);

  console.log('\n--- Importing kakomon 科目A 修了認定試験 (ALL 26 sessions) ---');
  const kakomonS = JSON.parse(readFileSync(`${BASE}/kakomon_questionsS.json`, 'utf8'));
  const sTotal = await importKakomonExam(kakomonS.exam_data, answers['科目A修了認定試験'], 'kakomon_S', existing);

  const grandTotal = catTotal + qTotal + aTotal + sTotal;
  console.log('\n=== Import complete ===');
  console.log(`category_questions: ${catTotal}`);
  console.log(`questions.json:     ${qTotal}`);
  console.log(`kakomon_A:          ${aTotal}`);
  console.log(`kakomon_S:          ${sTotal}`);
  console.log(`Total new:          ${grandTotal}`);
}

main().catch(console.error);
