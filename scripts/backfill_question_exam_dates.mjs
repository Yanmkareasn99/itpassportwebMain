import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, 'src', 'data');

function examDateFromPeriod(period) {
  const value = String(period ?? '');
  if (/^\d{6}$/.test(value)) {
    const month = Number(value.slice(4));
    if (month >= 1 && month <= 12) return `${value.slice(0, 4)}-${value.slice(4)}-01`;
  }
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  return null;
}

function readJson(filename) {
  return JSON.parse(readFileSync(resolve(DATA_DIR, filename), 'utf8'));
}

function buildSourceIndex() {
  const index = new Map();
  for (const [filename, sourceKind] of [
    ['kakomon_questionsA.json', 'kakomon_A'],
    ['kakomon_questionsS.json', 'kakomon_S'],
  ]) {
    const source = readJson(filename);
    for (const session of source.exam_data ?? []) {
      const examDate = examDateFromPeriod(session.year);
      if (!examDate) continue;
      for (const question of session.questions ?? []) {
        const questionText = question.question?.trim();
        if (!questionText) continue;
        const candidate = {
          exam_date: examDate,
          source_key: `${sourceKind}:${session.year}:Q${question.id}`,
        };
        const current = index.get(questionText);
        if (!current || candidate.exam_date > current.exam_date) index.set(questionText, candidate);
      }
    }
  }
  return index;
}

function requiredEnvironment() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run with --apply to update Supabase.');
  }
  if (serviceKey.startsWith('sb_publishable_')) {
    throw new Error('Use an sb_secret_ or legacy service_role key, not a publishable key.');
  }
  return { url, serviceKey };
}

async function fetchAllQuestions(supabase) {
  const questions = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions')
      .select('id, question_text, exam_date, source_key')
      .range(from, from + 999);
    if (error) throw error;
    questions.push(...(data ?? []));
    if (!data || data.length < 1000) return questions;
  }
}

async function main() {
  const { url, serviceKey } = requiredEnvironment();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sourceIndex = buildSourceIndex();
  const questions = await fetchAllQuestions(supabase);
  const updates = questions.flatMap(question => {
    if (question.exam_date || !question.question_text) return [];
    const metadata = sourceIndex.get(question.question_text.trim());
    return metadata ? [{ id: question.id, ...metadata }] : [];
  });
  const unidentified = questions.filter(question =>
    !question.exam_date && !sourceIndex.has(question.question_text?.trim()),
  );

  console.log(`Database questions: ${questions.length}`);
  console.log(`Already dated: ${questions.filter(question => question.exam_date).length}`);
  console.log(`Automatically identifiable: ${updates.length}`);
  console.log(`No exam metadata in source files: ${unidentified.length}`);

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to update the database.');
    return;
  }

  let updated = 0;
  for (let offset = 0; offset < updates.length; offset += 10) {
    const batch = updates.slice(offset, offset + 10);
    await Promise.all(batch.map(async update => {
      const { error } = await supabase.from('questions').update({
        exam_date: update.exam_date,
        source_key: update.source_key,
      }).eq('id', update.id);
      if (error) throw new Error(`Could not update question ${update.id}: ${error.message}`);
    }));
    updated += batch.length;
    console.log(`Updated ${updated}/${updates.length}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
