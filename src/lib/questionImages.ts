import questionsAData from '../data/kakomon_questionsA.json';
import questionsSData from '../data/kakomon_questionsS.json';
import { AnswerChoice, Question } from '../types';

interface SourceQuestion {
  id?: string | number;
  question?: string;
  image_file?: string;
  options?: Record<string, string>;
}

interface ExamSession {
  year: string | number;
  questions?: SourceQuestion[];
}

interface ExamData {
  exam_data?: ExamSession[];
}

interface ImageMetadata {
  question?: string;
  choices: Map<number, string>;
}

const imageModules = import.meta.glob('../data/img/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const imageUrls = new Map<string, string>();
for (const [modulePath, url] of Object.entries(imageModules)) {
  const relativePath = modulePath.replace('../data/img/', '').replace(/\\/g, '/');
  imageUrls.set(relativePath.toLowerCase(), url);
}

function getFilename(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() ?? '';
}

function getSessionFolder(year: string | number, examKind: 'A' | 'S') {
  const value = String(year);
  if (examKind === 'A' && value.toLowerCase() === 'sample') return 'sampleA';
  return `${value}${examKind}`;
}

function resolveBundledImage(relativePath: string | null | undefined) {
  if (!relativePath) return undefined;

  const normalized = relativePath.replace(/\\/g, '/');
  const imgIndex = normalized.toLowerCase().lastIndexOf('/img/');
  const assetPath = imgIndex >= 0
    ? normalized.slice(imgIndex + 5)
    : normalized.replace(/^\.?\/?src\/data\/img\//i, '').replace(/^img\//i, '');

  return imageUrls.get(assetPath.toLowerCase());
}

function resolveSourceImage(
  folder: string,
  sourcePath: string,
  questionId: string | number | undefined,
  choiceSuffix = '',
) {
  const id = String(questionId ?? '');
  const session = folder.replace(/[AS]$/i, '');
  const candidates = [
    getFilename(sourcePath),
    `${id}${choiceSuffix}.png`,
    `${id.padStart(2, '0')}${choiceSuffix}.png`,
    `${session}Q${id}${choiceSuffix}.png`,
    `${session}Q${id.padStart(2, '0')}${choiceSuffix}.png`,
  ];

  for (const filename of candidates) {
    const url = resolveBundledImage(`${folder}/${filename}`);
    if (url) return url;
  }
  return undefined;
}

const imageMetadataByQuestion = new Map<string, ImageMetadata>();

function indexExamData(data: ExamData, examKind: 'A' | 'S') {
  for (const session of data.exam_data ?? []) {
    const folder = getSessionFolder(session.year, examKind);

    for (const sourceQuestion of session.questions ?? []) {
      const questionText = sourceQuestion.question?.trim();
      if (!questionText) continue;

      const metadata: ImageMetadata = { choices: new Map() };
      if (sourceQuestion.image_file) {
        metadata.question = resolveSourceImage(
          folder,
          sourceQuestion.image_file,
          sourceQuestion.id,
        );
      }

      Object.values(sourceQuestion.options ?? {}).forEach((value, index) => {
        if (typeof value !== 'string' || !value.startsWith('../')) return;
        const choiceUrl = resolveSourceImage(
          folder,
          value,
          sourceQuestion.id,
          ['a', 'i', 'u', 'e'][index],
        );
        if (choiceUrl) metadata.choices.set(index + 1, choiceUrl);
      });

      if (metadata.question || metadata.choices.size > 0) {
        imageMetadataByQuestion.set(questionText, metadata);
      }
    }
  }
}

indexExamData(questionsAData as unknown as ExamData, 'A');
indexExamData(questionsSData as unknown as ExamData, 'S');

export function getQuestionImageUrl(question: Question | undefined) {
  if (!question) return undefined;

  const storedImage = question.image_url?.trim();
  if (storedImage && /^(https?:|data:|blob:)/i.test(storedImage)) {
    return storedImage;
  }

  return resolveBundledImage(storedImage)
    ?? (storedImage?.startsWith('/') ? storedImage : undefined)
    ?? imageMetadataByQuestion.get(question.question_text.trim())?.question;
}

export function getAnswerChoiceImageUrl(
  question: Question | undefined,
  choice: AnswerChoice,
) {
  const storedImage = choice.image_url?.trim();
  if (storedImage && /^(https?:|data:|blob:)/i.test(storedImage)) {
    return storedImage;
  }

  if (!question) return resolveBundledImage(storedImage);
  return resolveBundledImage(storedImage)
    ?? (storedImage?.startsWith('/') ? storedImage : undefined)
    ?? imageMetadataByQuestion.get(question.question_text.trim())?.choices.get(choice.sort_order);
}

export function isImageReference(value: string) {
  return value.startsWith('../') || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value);
}
