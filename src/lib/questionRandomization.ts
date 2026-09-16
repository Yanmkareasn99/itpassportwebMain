import type { AnswerChoice, Question } from '../types';

const RANDOMIZE_ANSWER_CHOICES_KEY = 'manabi-randomize-answer-choices';

export function shuffleItems<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function orderPracticeQuestions<T>(
  questions: readonly T[],
  preserveFilteredOrder: boolean,
  random: () => number = Math.random,
) {
  return preserveFilteredOrder ? [...questions] : shuffleItems(questions, random);
}

export function getRandomizeAnswerChoicesPreference() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(RANDOMIZE_ANSWER_CHOICES_KEY) === 'true';
}

export function setRandomizeAnswerChoicesPreference(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RANDOMIZE_ANSWER_CHOICES_KEY, String(enabled));
}

export function createAnswerChoiceOrders(
  questions: readonly Question[],
  randomize: boolean,
  random: () => number = Math.random,
) {
  return new Map<string, AnswerChoice[]>(questions.map(question => {
    const ordered = [...(question.answer_choices ?? [])]
      .sort((left, right) => left.sort_order - right.sort_order);
    return [question.id, randomize ? shuffleItems(ordered, random) : ordered];
  }));
}
