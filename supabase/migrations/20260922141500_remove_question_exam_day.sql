-- Question exam periods are stored as year and optional month only.
DROP TRIGGER IF EXISTS set_imported_question_exam_date_trigger ON public.question_import_staging;
DROP TRIGGER IF EXISTS infer_question_exam_date_trigger ON public.questions;
DROP TRIGGER IF EXISTS infer_question_exam_period_trigger ON public.questions;

DROP FUNCTION IF EXISTS public.set_imported_question_exam_date();
DROP FUNCTION IF EXISTS public.infer_question_exam_date();

CREATE OR REPLACE FUNCTION public.infer_question_exam_period()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_year integer;
BEGIN
  IF NEW.exam_year IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.exam_year IS DISTINCT FROM OLD.exam_year THEN
    RETURN NEW;
  END IF;

  IF NEW.source_key ~ '^ipa_itpass:[0-9]{4}' THEN
    source_year := substring(NEW.source_key FROM '^ipa_itpass:([0-9]{4})')::integer;
    IF source_year BETWEEN 1900 AND 2100 THEN
      NEW.exam_year := source_year;
      NEW.exam_month := CASE
        WHEN NEW.source_key ~ '^ipa_itpass:[0-9]{4}h[0-9]{2}h_' THEN 4
        WHEN NEW.source_key ~ '^ipa_itpass:[0-9]{4}(h[0-9]{2}a|r[0-9]{2}a|r[0-9]{2}o)_' THEN 10
        ELSE NULL
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER infer_question_exam_period_trigger
BEFORE INSERT OR UPDATE OF source_key, exam_year, exam_month ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.infer_question_exam_period();

DROP INDEX IF EXISTS public.questions_exam_date_subject_type_idx;
ALTER TABLE public.question_import_staging DROP COLUMN IF EXISTS exam_date;
ALTER TABLE public.questions DROP COLUMN IF EXISTS exam_date;
