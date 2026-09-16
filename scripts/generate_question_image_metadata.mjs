import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(projectRoot, 'src', 'data');
const outputPath = resolve(dataRoot, 'questionImageMetadata.json');

function questionKey(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sessionFolder(year, kind) {
  const value = String(year);
  if (kind === 'A' && value.toLowerCase() === 'sample') return 'sampleA';
  return `${value}${kind}`;
}

function imagePath(folder, sourcePath, questionId, suffix = '') {
  if (typeof sourcePath !== 'string' || !sourcePath.startsWith('../')) return null;
  const filename = sourcePath.replaceAll('\\', '/').split('/').pop();
  const id = String(questionId ?? '');
  const session = folder.replace(/[AS]$/i, '');
  const candidates = [
    filename,
    `${id}${suffix}.png`,
    `${id.padStart(2, '0')}${suffix}.png`,
    `${session}Q${id}${suffix}.png`,
    `${session}Q${id.padStart(2, '0')}${suffix}.png`,
  ].filter(Boolean);
  const found = candidates.find(candidate => existsSync(resolve(dataRoot, 'img', folder, candidate)));
  return found ? `${folder}/${found}` : null;
}

const metadata = {};
const keyOwners = new Map();
for (const [filename, kind] of [['kakomon_questionsA.json', 'A'], ['kakomon_questionsS.json', 'S']]) {
  const data = JSON.parse(readFileSync(resolve(dataRoot, filename), 'utf8'));
  for (const session of data.exam_data ?? []) {
    const folder = sessionFolder(session.year, kind);
    for (const question of session.questions ?? []) {
      const text = question.question?.trim();
      if (!text) continue;
      const questionImage = imagePath(folder, question.image_file, question.id);
      const choices = {};
      Object.values(question.options ?? {}).forEach((value, index) => {
        const path = imagePath(folder, value, question.id, ['a', 'i', 'u', 'e'][index]);
        if (path) choices[index + 1] = path;
      });
      if (!questionImage && Object.keys(choices).length === 0) continue;
      const key = questionKey(text);
      const previousOwner = keyOwners.get(key);
      if (previousOwner && previousOwner !== text) throw new Error(`Question image metadata hash collision: ${key}`);
      keyOwners.set(key, text);
      metadata[key] = {
        ...(questionImage ? { question: questionImage } : {}),
        ...(Object.keys(choices).length > 0 ? { choices } : {}),
      };
    }
  }
}

writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Generated ${Object.keys(metadata).length} question image metadata records.`);
