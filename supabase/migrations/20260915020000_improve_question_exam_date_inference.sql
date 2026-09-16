-- Support annual/monthly exam periods in both legacy and namespaced source keys.
WITH parsed AS (
  SELECT id, (regexp_match(source_key, '(^|:)([0-9]{6})(:|$)'))[2] AS period
  FROM public.questions
  WHERE exam_date IS NULL
)
UPDATE public.questions AS question
SET exam_date = make_date(left(parsed.period, 4)::integer, right(parsed.period, 2)::integer, 1)
FROM parsed
WHERE question.id = parsed.id
  AND right(parsed.period, 2)::integer BETWEEN 1 AND 12;

WITH parsed AS (
  SELECT id, (regexp_match(source_key, '(^|:)([0-9]{4})(:|$)'))[2] AS period
  FROM public.questions
  WHERE exam_date IS NULL
)
UPDATE public.questions AS question
SET exam_date = make_date(parsed.period::integer, 1, 1)
FROM parsed
WHERE question.id = parsed.id;

CREATE OR REPLACE FUNCTION public.infer_question_exam_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  matched text[];
  period text;
  month_number integer;
BEGIN
  IF NEW.exam_date IS NOT NULL OR NEW.source_key IS NULL THEN
    RETURN NEW;
  END IF;

  matched := regexp_match(NEW.source_key, '(^|:)([0-9]{6})(:|$)');
  IF matched IS NOT NULL THEN
    period := matched[2];
    month_number := right(period, 2)::integer;
    IF month_number BETWEEN 1 AND 12 THEN
      NEW.exam_date := make_date(left(period, 4)::integer, month_number, 1);
      RETURN NEW;
    END IF;
  END IF;

  matched := regexp_match(NEW.source_key, '(^|:)([0-9]{4})(:|$)');
  IF matched IS NOT NULL THEN
    NEW.exam_date := make_date(matched[2]::integer, 1, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS infer_question_exam_date_trigger ON public.questions;
CREATE TRIGGER infer_question_exam_date_trigger
BEFORE INSERT OR UPDATE OF source_key, exam_date ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.infer_question_exam_date();
