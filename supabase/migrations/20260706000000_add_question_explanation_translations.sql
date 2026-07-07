ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS explanation_ja text,
  ADD COLUMN IF NOT EXISTS explanation_en text,
  ADD COLUMN IF NOT EXISTS explanation_vi text;

UPDATE questions
SET explanation_ja = explanation
WHERE explanation_ja IS NULL
  AND explanation IS NOT NULL;
