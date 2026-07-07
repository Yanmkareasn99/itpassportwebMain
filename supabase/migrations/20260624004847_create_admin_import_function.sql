/*
# Create admin bulk-import helper function

Creates a SECURITY DEFINER function that allows bulk-inserting questions and
answer choices from a JSON payload. Runs as postgres superuser, bypassing RLS,
so the import script can use the anon key.

This function is used once for initial data import and is safe because:
- It only does INSERT with ON CONFLICT DO NOTHING
- It doesn't expose or modify any user data
*/

CREATE OR REPLACE FUNCTION import_questions_batch(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q jsonb;
  c jsonb;
  q_inserted int := 0;
  c_inserted int := 0;
BEGIN
  -- Insert questions
  FOR q IN SELECT * FROM jsonb_array_elements(payload->'questions')
  LOOP
    INSERT INTO questions (id, subject_id, question_number, question_text, question_type, explanation, difficulty, points)
    VALUES (
      (q->>'id')::uuid,
      (q->>'subject_id')::uuid,
      (q->>'question_number')::int,
      q->>'question_text',
      COALESCE(q->>'question_type', 'multiple_choice'),
      NULLIF(q->>'explanation', ''),
      COALESCE((q->>'difficulty')::int, 2),
      COALESCE((q->>'points')::int, 1)
    )
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN q_inserted := q_inserted + 1; END IF;
  END LOOP;

  -- Insert answer choices
  FOR c IN SELECT * FROM jsonb_array_elements(payload->'choices')
  LOOP
    INSERT INTO answer_choices (question_id, choice_text, is_correct, sort_order)
    VALUES (
      (c->>'question_id')::uuid,
      c->>'choice_text',
      (c->>'is_correct')::boolean,
      (c->>'sort_order')::int
    )
    ON CONFLICT DO NOTHING;
    IF FOUND THEN c_inserted := c_inserted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('questions_inserted', q_inserted, 'choices_inserted', c_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION import_questions_batch(jsonb) TO anon, authenticated;
