import { describe, expect, it } from 'vitest';
import { filterAdminQuestions, type AdminQuestionFilterOptions } from '../../src/lib/adminQuestionFilters';
import type { Question } from '../../src/types';

function question(overrides: Partial<Question> & Pick<Question, 'id' | 'question_number'>): Question {
  return {
    subject_id: 'subject-1',
    question_text: `Question ${overrides.question_number}`,
    question_type: 'multiple_choice',
    image_url: null,
    explanation: null,
    exam_year: null,
    exam_month: null,
    difficulty: 3,
    points: 1,
    ...overrides,
  };
}

const baseFilters: AdminQuestionFilterOptions = {
  search: '',
  subjectIds: [],
  questionNumber: '',
  examYear: '',
  questionImage: 'all',
  answerImage: 'all',
};

const questions = [
  question({ id: 'q1', question_number: 1, exam_year: 2024, image_url: 'question.webp' }),
  question({ id: 'q2', question_number: 2, exam_year: 2025 }),
  question({ id: 'q3', question_number: 12, exam_year: 2024 }),
];

describe('admin question filters', () => {
  it('matches exact question numbers and exam years', () => {
    const result = filterAdminQuestions(questions, new Set(), {
      ...baseFilters,
      questionNumber: '12',
      examYear: '2024',
    });

    expect(result.map(item => item.id)).toEqual(['q3']);
  });

  it('filters question and answer image presence independently', () => {
    expect(filterAdminQuestions(questions, new Set(['q2']), {
      ...baseFilters,
      questionImage: 'with',
    }).map(item => item.id)).toEqual(['q1']);

    expect(filterAdminQuestions(questions, new Set(['q2']), {
      ...baseFilters,
      answerImage: 'with',
    }).map(item => item.id)).toEqual(['q2']);

    expect(filterAdminQuestions(questions, new Set(['q2']), {
      ...baseFilters,
      questionImage: 'without',
      answerImage: 'without',
    }).map(item => item.id)).toEqual(['q3']);
  });

  it('matches questions from every selected subject', () => {
    const mixedSubjects = [
      question({ id: 'strategy', question_number: 1, subject_id: 'subject-1' }),
      question({ id: 'technology', question_number: 2, subject_id: 'subject-2' }),
      question({ id: 'management', question_number: 3, subject_id: 'subject-3' }),
    ];

    expect(filterAdminQuestions(mixedSubjects, new Set(), {
      ...baseFilters,
      subjectIds: ['subject-1', 'subject-3'],
    }).map(item => item.id)).toEqual(['strategy', 'management']);
  });

  it('matches text and number searches and detects embedded answer images', () => {
    expect(filterAdminQuestions(questions, new Set(), {
      ...baseFilters,
      search: 'question 2',
    }).map(item => item.id)).toEqual(['q2']);

    expect(filterAdminQuestions(questions, new Set(), {
      ...baseFilters,
      search: '12',
    }).map(item => item.id)).toEqual(['q3']);

    const questionsWithEmbeddedChoices = [
      question({
        id: 'with-answer-image',
        question_number: 20,
        answer_choices: [{
          id: 'choice-with-image',
          question_id: 'with-answer-image',
          choice_text: '',
          image_url: 'answer.webp',
          is_correct: true,
          sort_order: 1,
        }],
      }),
      question({
        id: 'without-answer-image',
        question_number: 21,
        answer_choices: [{
          id: 'choice-without-image',
          question_id: 'without-answer-image',
          choice_text: 'Text answer',
          image_url: null,
          is_correct: true,
          sort_order: 1,
        }],
      }),
    ];

    expect(filterAdminQuestions(questionsWithEmbeddedChoices, new Set(), {
      ...baseFilters,
      answerImage: 'with',
    }).map(item => item.id)).toEqual(['with-answer-image']);
  });
});
