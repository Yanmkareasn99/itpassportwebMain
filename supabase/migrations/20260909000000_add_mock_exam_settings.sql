-- Shared mock exam configuration. Only administrators may change it.
CREATE TABLE public.mock_exam_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  question_count integer NOT NULL DEFAULT 8 CHECK (question_count BETWEEN 1 AND 1000),
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 1 AND 1440),
  passing_score_percent integer NOT NULL DEFAULT 70 CHECK (passing_score_percent BETWEEN 0 AND 100)
);
INSERT INTO public.mock_exam_settings (id) VALUES (true);
ALTER TABLE public.mock_exam_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mock_exam_settings TO authenticated;
GRANT UPDATE ON public.mock_exam_settings TO authenticated;
CREATE POLICY read_mock_exam_settings ON public.mock_exam_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_update_mock_exam_settings ON public.mock_exam_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Preserve the rules used for each attempt, including historical defaults.
ALTER TABLE public.exam_sessions
  ADD COLUMN allowed_time_seconds integer NOT NULL DEFAULT 5400 CHECK (allowed_time_seconds BETWEEN 60 AND 86400),
  ADD COLUMN passing_score_percent integer NOT NULL DEFAULT 70 CHECK (passing_score_percent BETWEEN 0 AND 100);
