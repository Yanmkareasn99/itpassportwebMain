import type { Question } from '../types';

export type ImagePresenceFilter = 'all' | 'with' | 'without';

export interface AdminQuestionFilterOptions {
  search: string;
  subjectId: string;
  questionNumber: string;
  examYear: string;
  questionImage: ImagePresenceFilter;
  answerImage: ImagePresenceFilter;
}

function matchesImagePresence(hasImage: boolean, filter: ImagePresenceFilter) {
  return filter === 'all' || (filter === 'with' ? hasImage : !hasImage);
}

export function filterAdminQuestions(
  questions: Question[],
  answerImageQuestionIds: ReadonlySet<string>,
  filters: AdminQuestionFilterOptions,
) {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase();
  const questionNumber = filters.questionNumber.trim()
    ? Number(filters.questionNumber)
    : null;
  const examYear = filters.examYear.trim() ? Number(filters.examYear) : null;

  return questions.filter(question => {
    const hasQuestionImage = Boolean(question.image_url?.trim());
    const hasAnswerImage = answerImageQuestionIds.has(question.id)
      || Boolean(question.answer_choices?.some(choice => choice.image_url?.trim()));
    const matchesText = !normalizedSearch
      || question.question_text.toLocaleLowerCase().includes(normalizedSearch)
      || String(question.question_number).includes(normalizedSearch);

    return (filters.subjectId === 'all' || question.subject_id === filters.subjectId)
      && (questionNumber === null || question.question_number === questionNumber)
      && (examYear === null || question.exam_year === examYear)
      && matchesImagePresence(hasQuestionImage, filters.questionImage)
      && matchesImagePresence(hasAnswerImage, filters.answerImage)
      && matchesText;
  });
}
