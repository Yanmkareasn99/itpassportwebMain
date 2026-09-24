-- Private, persistent review priority selected by each learner.
CREATE TABLE IF NOT EXISTS public.question_flags (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('green', 'orange', 'red')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE public.question_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_question_flags" ON public.question_flags;
CREATE POLICY "users_select_own_question_flags"
ON public.question_flags FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_question_flags" ON public.question_flags;
CREATE POLICY "users_insert_own_question_flags"
ON public.question_flags FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_question_flags" ON public.question_flags;
CREATE POLICY "users_update_own_question_flags"
ON public.question_flags FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_question_flags" ON public.question_flags;
CREATE POLICY "users_delete_own_question_flags"
ON public.question_flags FOR DELETE TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_flags TO authenticated;

CREATE INDEX IF NOT EXISTS question_flags_user_level_updated_idx
ON public.question_flags (user_id, level, updated_at DESC);
