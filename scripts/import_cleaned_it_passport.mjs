import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DATA_DIR = resolve('imports/it_passport_clean');
const KEY_FILE = resolve('imports/.supabase-import.env');
const PROJECT_URL = 'https://vazepspmnkxxskssjogg.supabase.co';
const BUCKET = 'question-images';
const LETTERS = ['ア', 'イ', 'ウ', 'エ'];
const APPLY = process.argv.includes('--apply');
const RESUME = process.argv.includes('--resume');

class DisabledRealtimeTransport {
  constructor() {
    throw new Error('Realtime is disabled for the dataset import.');
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(name) {
  return JSON.parse(await readFile(join(DATA_DIR, name), 'utf8'));
}

function publicUrl(objectPath) {
  const path = storagePath(objectPath).split('/').map(encodeURIComponent).join('/');
  return `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

function storagePath(objectPath) {
  return [...objectPath].map(character => /[A-Za-z0-9/_.-]/.test(character)
    ? character
    : `_u${character.codePointAt(0).toString(16)}_`).join('');
}

function imageMime(objectPath) {
  const extension = extname(objectPath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  throw new Error(`Unsupported image extension: ${objectPath}`);
}

async function loadSecretKey() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv) return fromEnv;
  const lines = (await readFile(KEY_FILE, 'utf8')).split(/\r?\n/);
  const line = lines.find(value => /^SUPABASE_SERVICE_ROLE_KEY\s*=/.test(value));
  assert(line, `Set SUPABASE_SERVICE_ROLE_KEY in ${KEY_FILE}`);
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  assert(value && !value.includes('YOUR_'), 'The import key is empty or a placeholder.');
  return value;
}

async function loadBundle() {
  const [questions, choices, manifest] = await Promise.all([
    readJson('questions.json'),
    readJson('answer_choices.json'),
    readJson('asset_manifest.json'),
  ]);
  assert(Array.isArray(questions) && questions.length === 2900, 'Expected 2,900 questions.');
  assert(Array.isArray(choices) && choices.length === 11600, 'Expected 11,600 choices.');
  assert(Object.keys(manifest).length === 1304, 'Expected 1,304 image links.');
  const questionIds = new Set(questions.map(q => q.id));
  assert(questionIds.size === questions.length, 'Question IDs are not unique.');
  assert(new Set(choices.map(c => c.id)).size === choices.length, 'Choice IDs are not unique.');
  const correct = new Map();
  for (const choice of choices) {
    assert(questionIds.has(choice.question_id), `Choice ${choice.id} has an unknown question.`);
    if (choice.is_correct) correct.set(choice.question_id, (correct.get(choice.question_id) ?? 0) + 1);
  }
  assert(questions.every(q => correct.get(q.id) === 1), 'Every question needs one correct answer.');

  const assetPaths = [...new Set(Object.values(manifest))];
  assert(new Set(assetPaths.map(storagePath)).size === assetPaths.length, 'Image storage paths are not unique.');
  for (const objectPath of assetPaths) {
    assert(objectPath.startsWith('dataset-2009-2026/') && !objectPath.includes('..'), `Unsafe image path: ${objectPath}`);
    const file = join(DATA_DIR, 'assets', objectPath);
    assert((await stat(file)).isFile(), `Missing image: ${file}`);
    imageMime(objectPath);
  }

  const questionRows = questions.map(question => {
    const sourceId = question.source_key?.replace(/^ipa_itpass:/, '');
    assert(sourceId && sourceId !== question.source_key, `Invalid source key: ${question.id}`);
    return { ...question, image_url: manifest[`question:${sourceId}`] ? publicUrl(manifest[`question:${sourceId}`]) : null };
  });
  const questionSourceId = new Map(questions.map(question => [question.id, question.source_key.slice('ipa_itpass:'.length)]));
  const choiceRows = choices.map(choice => {
    const sourceId = questionSourceId.get(choice.question_id);
    const letter = LETTERS[choice.sort_order - 1];
    assert(sourceId && letter, `Invalid choice identity: ${choice.id}`);
    const objectPath = manifest[`choice:${sourceId}:${letter}`];
    return { ...choice, image_url: objectPath ? publicUrl(objectPath) : null };
  });
  assert(questionRows.filter(row => row.image_url).length === 508, 'Expected 508 question images.');
  assert(choiceRows.filter(row => row.image_url).length === 796, 'Expected 796 choice images.');
  return { questionRows, choiceRows, assetPaths };
}

async function uploadImages(supabase, assetPaths) {
  let uploaded = 0;
  for (let offset = 0; offset < assetPaths.length; offset += 8) {
    const batch = assetPaths.slice(offset, offset + 8);
    await Promise.all(batch.map(async objectPath => {
      const body = await readFile(join(DATA_DIR, 'assets', objectPath));
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath(objectPath), body, {
        contentType: imageMime(objectPath),
        cacheControl: '3600',
        upsert: true,
      });
      if (error) throw new Error(`Image upload failed for ${objectPath}: ${error.message}`);
    }));
    uploaded += batch.length;
    if (uploaded % 104 === 0 || uploaded === assetPaths.length) {
      process.stdout.write(`Uploaded ${uploaded}/${assetPaths.length} images\n`);
    }
  }
}

async function upsertRows(supabase, table, rows, batchSize) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(offset, offset + batchSize), { onConflict: 'id' });
    if (error) throw new Error(`${table} batch ${offset / batchSize + 1} failed: ${error.message}`);
    if ((offset / batchSize + 1) % 10 === 0 || offset + batchSize >= rows.length) {
      process.stdout.write(`${table}: ${Math.min(offset + batchSize, rows.length)}/${rows.length}\n`);
    }
  }
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const { questionRows, choiceRows, assetPaths } = await loadBundle();
  process.stdout.write(`Validated ${questionRows.length} questions, ${choiceRows.length} choices, ${assetPaths.length} images.\n`);
  if (!APPLY) {
    process.stdout.write('Dry run only. Run with --apply after adding the local import key.\n');
    return;
  }

  const supabase = createClient(PROJECT_URL, await loadSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: DisabledRealtimeTransport },
  });
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(BUCKET);
  if (bucketError || !bucket?.public) throw new Error(`Public ${BUCKET} bucket is unavailable: ${bucketError?.message ?? ''}`);
  const { data: subjects, error: subjectError } = await supabase.from('subjects').select('id');
  if (subjectError) throw subjectError;
  const availableSubjects = new Set((subjects ?? []).map(subject => subject.id));
  assert(questionRows.every(question => availableSubjects.has(question.subject_id)), 'Required subject rows are missing.');
  const [existingQuestions, existingChoices] = await Promise.all([
    countRows(supabase, 'questions'), countRows(supabase, 'answer_choices'),
  ]);
  if ((existingQuestions || existingChoices) && !RESUME) {
    throw new Error('Question tables are not empty. Re-run with --resume only for a partial import of this same bundle.');
  }

  await uploadImages(supabase, assetPaths);
  await upsertRows(supabase, 'questions', questionRows, 100);
  await upsertRows(supabase, 'answer_choices', choiceRows, 400);
  const [finalQuestions, finalChoices] = await Promise.all([
    countRows(supabase, 'questions'), countRows(supabase, 'answer_choices'),
  ]);
  assert(finalQuestions === questionRows.length && finalChoices === choiceRows.length,
    `Unexpected final counts: ${finalQuestions} questions, ${finalChoices} choices.`);
  process.stdout.write('Import complete and row counts verified.\n');
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
