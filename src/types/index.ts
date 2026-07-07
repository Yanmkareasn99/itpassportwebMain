export interface Profile {
  id: string;
  name: string;
  student_id: string | null;
  role: 'student' | 'teacher';
  class_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
}

export interface Question {
  id: string;
  subject_id: string;
  question_number: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'tree';
  image_url: string | null;
  explanation: string | null;
  explanation_ja?: string | null;
  explanation_en?: string | null;
  explanation_vi?: string | null;
  difficulty: number;
  points: number;
  answer_choices?: AnswerChoice[];
}

export interface AnswerChoice {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  subject_id: string | null;
  total_questions: number;
  correct_answers: number;
  completed_at: string | null;
  created_at: string;
}

export interface ExamSession {
  id: string;
  user_id: string;
  total_questions: number;
  correct_answers: number;
  time_taken_seconds: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface BattleRoom {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  subject_id: string | null;
  status: 'waiting' | 'active' | 'completed';
  creator_score: number;
  opponent_score: number;
  winner_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export type Page =
  | 'home'
  | 'practice-list'
  | 'practice-question'
  | 'mock-exam'
  | 'battle'
  | 'ai-chat'
  | 'materials'
  | 'settings'
  | 'results'
  | 'admin';
