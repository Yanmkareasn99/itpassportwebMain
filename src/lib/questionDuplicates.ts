export interface DuplicateQuestionCandidate {
  key: string;
  questionText: string;
  sourceKey?: string | null;
}

export interface ExistingQuestionIdentity {
  questionText: string;
  sourceKey?: string | null;
}

export function normalizeQuestionText(text: string) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\u3000\u200B-\u200D\uFEFF]+/gu, '')
    .trim();
}

export function findDuplicateQuestionKeys(
  candidates: readonly DuplicateQuestionCandidate[],
  existing: readonly ExistingQuestionIdentity[],
  options: { allowMatchingSourceKey?: boolean } = {},
) {
  const existingByText = new Map<string, ExistingQuestionIdentity[]>();
  const existingSourceKeys = new Set<string>();
  for (const question of existing) {
    const normalizedText = normalizeQuestionText(question.questionText);
    if (normalizedText) {
      const matches = existingByText.get(normalizedText) ?? [];
      matches.push(question);
      existingByText.set(normalizedText, matches);
    }
    if (question.sourceKey) existingSourceKeys.add(question.sourceKey.trim());
  }

  const duplicateKeys = new Set<string>();
  const firstCandidateByText = new Map<string, string>();
  const firstCandidateBySource = new Map<string, string>();

  for (const candidate of candidates) {
    const normalizedText = normalizeQuestionText(candidate.questionText);
    const sourceKey = candidate.sourceKey?.trim() || null;
    const firstTextMatch = normalizedText ? firstCandidateByText.get(normalizedText) : undefined;
    if (firstTextMatch) {
      duplicateKeys.add(firstTextMatch);
      duplicateKeys.add(candidate.key);
    } else if (normalizedText) {
      firstCandidateByText.set(normalizedText, candidate.key);
    }

    if (sourceKey) {
      const firstSourceMatch = firstCandidateBySource.get(sourceKey);
      if (firstSourceMatch) {
        duplicateKeys.add(firstSourceMatch);
        duplicateKeys.add(candidate.key);
      } else {
        firstCandidateBySource.set(sourceKey, candidate.key);
      }
    }

    const matchingExistingText = normalizedText ? existingByText.get(normalizedText) ?? [] : [];
    const textAlreadyExists = matchingExistingText.some(question => (
      !options.allowMatchingSourceKey
      || !sourceKey
      || question.sourceKey?.trim() !== sourceKey
    ));
    const sourceAlreadyExists = Boolean(sourceKey && existingSourceKeys.has(sourceKey));
    if (textAlreadyExists || (sourceAlreadyExists && !options.allowMatchingSourceKey)) {
      duplicateKeys.add(candidate.key);
    }
  }

  return [...duplicateKeys];
}
