BEGIN;

-- Repair older databases before history queries and indexes use answered_at.
ALTER TABLE public.session_answers ADD COLUMN IF NOT EXISTS answered_at timestamptz;

-- Preserve existing answer timestamps. For legacy rows, prefer created_at
-- when available, otherwise use the session date as an approximation.
UPDATE public.session_answers AS answer
SET answered_at = COALESCE(
  NULLIF(to_jsonb(answer)->>'created_at', '')::timestamptz,
  (SELECT session.created_at FROM public.practice_sessions AS session WHERE session.id = answer.session_id),
  now()
)
WHERE answer.answered_at IS NULL;

ALTER TABLE public.session_answers ALTER COLUMN answered_at SET DEFAULT now();
ALTER TABLE public.session_answers ALTER COLUMN answered_at SET NOT NULL;

-- Persist the question order so practice routes can be reopened after refresh.
ALTER TABLE public.practice_sessions ADD COLUMN IF NOT EXISTS question_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS practice_sessions_user_id_id_idx ON public.practice_sessions (user_id, id);
CREATE INDEX IF NOT EXISTS session_answers_session_time_idx ON public.session_answers (session_id, answered_at, id);
CREATE INDEX IF NOT EXISTS questions_subject_difficulty_type_idx ON public.questions (subject_id, difficulty, question_type);

COMMIT;
