export interface ImportedChoiceText {
  label: string;
  text: string;
  sortOrder: number;
}

export function shouldKeepQuestionImage(questionText: string, choices: ImportedChoiceText[]) {
  const normalized = questionText.normalize('NFKC');
  const refersToVisual = /(?:^|[\s、。(（])(?:図|表)(?:\s*\d+|[をのにでとへがはから]|$)|(?:下|上|次)の(?:図|表)|グラフ|フローチャート|模式図|構成図|状態遷移図|ネットワーク図|ER図|図中|表中|下図|上図/.test(normalized);
  const choicesNeedVisuals = choices.length < 2
    || choices.some(choice => !choice.text.trim() || choice.text.trim() === choice.label);
  return refersToVisual || choicesNeedVisuals;
}

export function ensureDiagramChoiceLabels(choices: ImportedChoiceText[]) {
  const existing = new Map(choices.map(choice => [choice.label, choice]));
  const labels = [...new Set([...'アイウエ', ...choices.map(choice => choice.label)])];
  return labels.map((label, index) => ({
    ...(existing.get(label) ?? { label, text: label }),
    sortOrder: index + 1,
  }));
}
