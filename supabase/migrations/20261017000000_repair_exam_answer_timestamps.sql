BEGIN;

-- CREATE TABLE IF NOT EXISTS in the initial schema does not repair older tables.
ALTER TABLE public.exam_answers ADD COLUMN IF NOT EXISTS answered_at timestamptz;

-- Keep exact answer timestamps. Approximate undated legacy answers using their
-- original creation time, exam completion time, or exam creation time, in order.
UPDATE public.exam_answers AS answer
SET answered_at = COALESCE(
  NULLIF(to_jsonb(answer)->>'created_at', '')::timestamptz,
  (SELECT COALESCE(session.completed_at, session.created_at)
   FROM public.exam_sessions AS session WHERE session.id = answer.exam_session_id),
  now()
)
WHERE answer.answered_at IS NULL;

ALTER TABLE public.exam_answers ALTER COLUMN answered_at SET DEFAULT now();
ALTER TABLE public.exam_answers ALTER COLUMN answered_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS exam_answers_session_id_id_idx ON public.exam_answers (exam_session_id, id);

NOTIFY pgrst, 'reload schema';

COMMIT;
