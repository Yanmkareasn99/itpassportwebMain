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
  subjectId: 'all',
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
});
