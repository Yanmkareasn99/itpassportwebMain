export interface ChoiceForm {
  id?: string;
  choice_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface QuestionForm {
  subject_id: string;
  question_number: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'tree';
  explanation: string;
  explanation_en: string;
  explanation_vi: string;
  difficulty: number;
  points: number;
  image_url: string;
  choices: ChoiceForm[];
}

export interface CsvImportData {
  questions: Record<string, string>[];
  choices: Record<string, string>[];
}

export interface SubjectForm {
  name: string;
  description: string;
  color: string;
}

export const emptyQuestionForm = (): QuestionForm => ({
  subject_id: '',
  question_number: '',
  question_text: '',
  question_type: 'multiple_choice',
  explanation: '',
  explanation_en: '',
  explanation_vi: '',
  difficulty: 3,
  points: 1,
  image_url: '',
  choices: [
    { choice_text: '', is_correct: false, sort_order: 1 },
    { choice_text: '', is_correct: false, sort_order: 2 },
    { choice_text: '', is_correct: false, sort_order: 3 },
    { choice_text: '', is_correct: false, sort_order: 4 },
  ],
});

export const emptySubjectForm = (): SubjectForm => ({
  name: '',
  description: '',
  color: '#3B82F6',
});
