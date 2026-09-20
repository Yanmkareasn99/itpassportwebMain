import imageMetadataData from "../data/questionImageMetadata.json";
import type { AnswerChoice, Question } from "../types";

interface ImageMetadata {
  question?: string;
  choices?: Record<string, string>;
}

type ImageLoader = () => Promise<string>;

const imageMetadata = imageMetadataData as Record<string, ImageMetadata>;
const imageModules = import.meta.glob("../data/img/**/*.png", {
  query: "?url",
  import: "default",
}) as Record<string, ImageLoader>;

const imageLoaders = new Map<string, ImageLoader>();
for (const [modulePath, loader] of Object.entries(imageModules)) {
  const relativePath = modulePath
    .replace("../data/img/", "")
    .replace(/\\/g, "/");
  imageLoaders.set(relativePath.toLowerCase(), loader);
}

const imagePromises = new Map<string, Promise<string | undefined>>();

function questionKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeAssetPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const imgIndex = normalized.toLowerCase().lastIndexOf("/img/");
  return imgIndex >= 0
    ? normalized.slice(imgIndex + 5)
    : normalized.replace(/^\.?\/?src\/data\/img\//i, "").replace(/^img\//i, "");
}

function resolveBundledImage(path: string | null | undefined) {
  if (!path) return Promise.resolve(undefined);
  const assetPath = normalizeAssetPath(path).toLowerCase();
  const existing = imagePromises.get(assetPath);
  if (existing) return existing;
  const loader = imageLoaders.get(assetPath);
  const promise = loader
    ? loader().catch(() => undefined)
    : Promise.resolve(undefined);
  imagePromises.set(assetPath, promise);
  return promise;
}

function isDirectUrl(path: string) {
  return /^(https?:|data:|blob:)/i.test(path);
}

export async function getQuestionImageUrl(question: Question | undefined) {
  if (!question) return undefined;

  const storedImage = question.image_url?.trim();
  if (storedImage && isDirectUrl(storedImage)) return storedImage;

  const storedAsset = await resolveBundledImage(storedImage);
  if (storedAsset) return storedAsset;
  if (storedImage?.startsWith("/")) return storedImage;

  const fallbackPath =
    imageMetadata[questionKey(question.question_text.trim())]?.question;
  return resolveBundledImage(fallbackPath);
}

export async function getAnswerChoiceImageUrl(
  question: Question | undefined,
  choice: AnswerChoice,
) {
  const storedImage = choice.image_url?.trim();
  if (storedImage && isDirectUrl(storedImage)) return storedImage;

  const storedAsset = await resolveBundledImage(storedImage);
  if (storedAsset) return storedAsset;
  if (storedImage?.startsWith("/")) return storedImage;
  if (!question) return undefined;

  const fallbackPath =
    imageMetadata[questionKey(question.question_text.trim())]?.choices?.[
      String(choice.sort_order)
    ];
  return resolveBundledImage(fallbackPath);
}

export function isImageReference(value: string) {
  return (
    value.startsWith("../") || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value)
  );
}
