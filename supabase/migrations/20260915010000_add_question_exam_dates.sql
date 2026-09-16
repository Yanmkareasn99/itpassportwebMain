-- Categorize practice questions by the date of the source exam.
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS exam_date date;

ALTER TABLE public.question_import_staging
ADD COLUMN IF NOT EXISTS exam_date date;

CREATE INDEX IF NOT EXISTS questions_exam_date_subject_type_idx
ON public.questions (exam_date DESC, subject_id, question_type);

-- Older imports commonly begin their source key with YYYYMM. Preserve those
-- records by assigning the first day of that exam month when it is valid.
UPDATE public.questions
SET exam_date = make_date(
  substring(source_key FROM '^([0-9]{4})')::integer,
  substring(source_key FROM '^[0-9]{4}([0-9]{2})')::integer,
  1
)
WHERE exam_date IS NULL
  AND source_key ~ '^[0-9]{6}'
  AND substring(source_key FROM '^[0-9]{4}([0-9]{2})')::integer BETWEEN 1 AND 12;

CREATE OR REPLACE FUNCTION public.set_imported_question_exam_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.exam_date IS NOT NULL THEN
    UPDATE public.questions
    SET exam_date = NEW.exam_date
    WHERE source_key = NEW.source_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_imported_question_exam_date_trigger
ON public.question_import_staging;

CREATE TRIGGER set_imported_question_exam_date_trigger
AFTER INSERT OR UPDATE OF exam_date ON public.question_import_staging
FOR EACH ROW
EXECUTE FUNCTION public.set_imported_question_exam_date();
