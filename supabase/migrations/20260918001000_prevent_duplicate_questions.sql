-- Prevent duplicate question text even when two administrators import at the
-- same time. Existing duplicates are left untouched; this guard applies to
-- new inserts and edits.

CREATE OR REPLACE FUNCTION public.normalized_question_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT regexp_replace(lower(normalize(value, NFKC)), '[[:space:]　]+', '', 'g');
$$;

REVOKE ALL ON FUNCTION public.normalized_question_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalized_question_text(text) TO authenticated;

CREATE INDEX IF NOT EXISTS questions_normalized_text_idx
ON public.questions (public.normalized_question_text(question_text));

CREATE OR REPLACE FUNCTION public.prevent_duplicate_question_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_text text := public.normalized_question_text(NEW.question_text);
BEGIN
  -- Serialize competing imports of the same normalized text.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.questions AS existing
    WHERE public.normalized_question_text(existing.question_text) = normalized_text
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'This question already exists.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_question_text() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_duplicate_question_text_trigger
ON public.questions;

CREATE TRIGGER prevent_duplicate_question_text_trigger
BEFORE INSERT OR UPDATE OF question_text ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_question_text();
