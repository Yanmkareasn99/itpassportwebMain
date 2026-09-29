-- Exam periods have a year and, where known, a month. Keep exam_date for
-- compatibility with older clients and import scripts during the transition.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS exam_year integer,
  ADD COLUMN IF NOT EXISTS exam_month integer;

ALTER TABLE public.question_import_staging
  ADD COLUMN IF NOT EXISTS exam_year integer,
  ADD COLUMN IF NOT EXISTS exam_month integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_exam_year_range') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_exam_year_range CHECK (exam_year BETWEEN 1900 AND 2100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_exam_month_range') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_exam_month_range CHECK (exam_month BETWEEN 1 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_exam_month_requires_year') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_exam_month_requires_year CHECK (exam_month IS NULL OR exam_year IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.question_import_staging'::regclass AND conname = 'question_import_exam_year_range') THEN
    ALTER TABLE public.question_import_staging ADD CONSTRAINT question_import_exam_year_range CHECK (exam_year BETWEEN 1900 AND 2100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.question_import_staging'::regclass AND conname = 'question_import_exam_month_range') THEN
    ALTER TABLE public.question_import_staging ADD CONSTRAINT question_import_exam_month_range CHECK (exam_month BETWEEN 1 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.question_import_staging'::regclass AND conname = 'question_import_exam_month_requires_year') THEN
    ALTER TABLE public.question_import_staging ADD CONSTRAINT question_import_exam_month_requires_year CHECK (exam_month IS NULL OR exam_year IS NOT NULL);
  END IF;
END;
$$;

UPDATE public.questions
SET exam_year = EXTRACT(YEAR FROM exam_date)::integer,
    exam_month = EXTRACT(MONTH FROM exam_date)::integer
WHERE exam_date IS NOT NULL AND exam_year IS NULL;

UPDATE public.question_import_staging
SET exam_year = EXTRACT(YEAR FROM exam_date)::integer,
    exam_month = EXTRACT(MONTH FROM exam_date)::integer
WHERE exam_date IS NOT NULL AND exam_year IS NULL;

-- Earlier import scripts stored year-only periods as January 1. That month
-- was a placeholder, so restore the unknown month for those source keys.
UPDATE public.questions
SET exam_month = NULL
WHERE source_key ~ '(^|:)[0-9]{4}(:|$)'
  AND exam_date = make_date(exam_year, 1, 1);

-- Namespaced IPA dataset keys contain the actual year and session. Annual
-- public CBT sets and the special set have no month in the source archive.
UPDATE public.questions
SET exam_year = substring(source_key FROM '^ipa_itpass:([0-9]{4})')::integer,
    exam_month = CASE
      WHEN source_key ~ '^ipa_itpass:[0-9]{4}h[0-9]{2}h_' THEN 4
      WHEN source_key ~ '^ipa_itpass:[0-9]{4}(h[0-9]{2}a|r[0-9]{2}a|r[0-9]{2}o)_' THEN 10
      ELSE NULL
    END
WHERE source_key ~ '^ipa_itpass:[0-9]{4}'
  AND substring(source_key FROM '^ipa_itpass:([0-9]{4})')::integer BETWEEN 1900 AND 2100;

CREATE INDEX IF NOT EXISTS questions_exam_period_subject_type_idx
ON public.questions (exam_year DESC, exam_month DESC, subject_id, question_type);

CREATE OR REPLACE FUNCTION public.infer_question_exam_period()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_year integer;
BEGIN
  IF NEW.exam_year IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.exam_year IS DISTINCT FROM OLD.exam_year THEN
      RETURN NEW;
    END IF;
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
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.exam_date IS NOT NULL THEN
    NEW.exam_year := EXTRACT(YEAR FROM NEW.exam_date)::integer;
    NEW.exam_month := EXTRACT(MONTH FROM NEW.exam_date)::integer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS infer_question_exam_period_trigger ON public.questions;
CREATE TRIGGER infer_question_exam_period_trigger
BEFORE INSERT OR UPDATE OF source_key, exam_date, exam_year, exam_month ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.infer_question_exam_period();

CREATE OR REPLACE FUNCTION public.set_imported_question_exam_period()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.exam_year IS NOT NULL THEN
    UPDATE public.questions
    SET exam_year = NEW.exam_year,
        exam_month = NEW.exam_month
    WHERE source_key = NEW.source_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_imported_question_exam_period_trigger ON public.question_import_staging;
CREATE TRIGGER set_imported_question_exam_period_trigger
AFTER INSERT OR UPDATE OF exam_year, exam_month ON public.question_import_staging
FOR EACH ROW EXECUTE FUNCTION public.set_imported_question_exam_period();
