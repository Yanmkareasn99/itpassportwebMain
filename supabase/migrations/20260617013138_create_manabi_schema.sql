
-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  student_id text UNIQUE,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  class_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_subjects" ON subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_subjects" ON subjects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_subjects" ON subjects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_subjects" ON subjects FOR DELETE TO authenticated USING (true);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  question_number int NOT NULL DEFAULT 1,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'tree')),
  image_url text,
  explanation text,
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  points int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_questions" ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_questions" ON questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_questions" ON questions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_questions" ON questions FOR DELETE TO authenticated USING (true);

-- Answer choices
CREATE TABLE IF NOT EXISTS answer_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  choice_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE answer_choices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_choices" ON answer_choices FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_choices" ON answer_choices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_choices" ON answer_choices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_choices" ON answer_choices FOR DELETE TO authenticated USING (true);

-- Practice sessions
CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  total_questions int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_practice" ON practice_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_practice" ON practice_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_practice" ON practice_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_practice" ON practice_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Session answers
CREATE TABLE IF NOT EXISTS session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  selected_choice_id uuid REFERENCES answer_choices(id) ON DELETE SET NULL,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_session_answers" ON session_answers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.id = session_answers.session_id AND ps.user_id = auth.uid())
);
CREATE POLICY "insert_own_session_answers" ON session_answers FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.id = session_answers.session_id AND ps.user_id = auth.uid())
);
CREATE POLICY "update_own_session_answers" ON session_answers FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.id = session_answers.session_id AND ps.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.id = session_answers.session_id AND ps.user_id = auth.uid())
);
CREATE POLICY "delete_own_session_answers" ON session_answers FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.id = session_answers.session_id AND ps.user_id = auth.uid())
);

-- Exam sessions (mock exams)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  total_questions int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  time_taken_seconds int,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_exam" ON exam_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_exam" ON exam_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_exam" ON exam_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_exam" ON exam_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Exam answers
CREATE TABLE IF NOT EXISTS exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id uuid REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  selected_choice_id uuid REFERENCES answer_choices(id) ON DELETE SET NULL,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_exam_answers" ON exam_answers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = exam_answers.exam_session_id AND es.user_id = auth.uid())
);
CREATE POLICY "insert_own_exam_answers" ON exam_answers FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = exam_answers.exam_session_id AND es.user_id = auth.uid())
);
CREATE POLICY "update_own_exam_answers" ON exam_answers FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = exam_answers.exam_session_id AND es.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = exam_answers.exam_session_id AND es.user_id = auth.uid())
);
CREATE POLICY "delete_own_exam_answers" ON exam_answers FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = exam_answers.exam_session_id AND es.user_id = auth.uid())
);

-- Battle rooms
CREATE TABLE IF NOT EXISTS battle_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  creator_score int DEFAULT 0,
  opponent_score int DEFAULT 0,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE battle_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_battle_rooms" ON battle_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_battle_rooms" ON battle_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_battle_rooms" ON battle_rooms FOR UPDATE TO authenticated USING (
  auth.uid() = creator_id OR auth.uid() = opponent_id
) WITH CHECK (
  auth.uid() = creator_id OR auth.uid() = opponent_id
);
CREATE POLICY "delete_battle_rooms" ON battle_rooms FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- Exam target date
CREATE TABLE IF NOT EXISTS exam_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  target_date date NOT NULL,
  exam_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exam_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_target" ON exam_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_target" ON exam_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_target" ON exam_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_target" ON exam_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);
