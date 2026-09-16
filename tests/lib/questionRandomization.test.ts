import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAnswerChoiceOrders,
  getRandomizeAnswerChoicesPreference,
  orderPracticeQuestions,
  setRandomizeAnswerChoicesPreference,
  shuffleItems,
} from '../../src/lib/questionRandomization';
import type { Question } from '../../src/types';

beforeEach(() => localStorage.clear());

describe('question randomization', () => {
  it('shuffles a copy without changing the original order', () => {
    const original = [1, 2, 3, 4];
    const shuffled = shuffleItems(original, () => 0);

    expect(shuffled).toEqual([2, 3, 4, 1]);
    expect(original).toEqual([1, 2, 3, 4]);
  });

  it('preserves filtered practice order while randomizing other practice', () => {
    const questions = ['q1', 'q2', 'q3', 'q4'];

    expect(orderPracticeQuestions(questions, true, () => 0)).toEqual(questions);
    expect(orderPracticeQuestions(questions, false, () => 0)).toEqual(['q2', 'q3', 'q4', 'q1']);
    expect(questions).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('persists the answer-choice preference', () => {
    expect(getRandomizeAnswerChoicesPreference()).toBe(false);
    setRandomizeAnswerChoicesPreference(true);
    expect(getRandomizeAnswerChoicesPreference()).toBe(true);
    setRandomizeAnswerChoicesPreference(false);
    expect(getRandomizeAnswerChoicesPreference()).toBe(false);
  });

  it('keeps the configured order when answer randomization is off', () => {
    const question = {
      id: 'q1',
      answer_choices: [
        { id: 'b', question_id: 'q1', choice_text: 'B', is_correct: false, sort_order: 2 },
        { id: 'a', question_id: 'q1', choice_text: 'A', is_correct: true, sort_order: 1 },
        { id: 'c', question_id: 'q1', choice_text: 'C', is_correct: false, sort_order: 3 },
      ],
    } as Question;

    const ordered = createAnswerChoiceOrders([question], false).get('q1');
    expect(ordered?.map(choice => choice.id)).toEqual(['a', 'b', 'c']);
    expect(ordered).not.toBe(question.answer_choices);
    const randomized = createAnswerChoiceOrders([question], true, () => 0).get('q1');
    expect(randomized?.map(choice => choice.id)).toEqual(['b', 'c', 'a']);
  });
});
