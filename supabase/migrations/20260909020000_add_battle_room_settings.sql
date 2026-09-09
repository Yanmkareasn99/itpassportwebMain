BEGIN;

ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS time_per_question_seconds integer NOT NULL DEFAULT 30
  CHECK (time_per_question_seconds BETWEEN 5 AND 300);

-- Keep the two-argument function for older clients; new clients specify all three settings.
CREATE OR REPLACE FUNCTION create_battle_room(wager int, question_count int, seconds_per_question int)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_question_ids uuid[];
  created_room battle_rooms;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF wager IS NULL OR wager < 0 THEN
    RAISE EXCEPTION 'Wager must be zero or more';
  END IF;

  IF question_count IS NULL OR question_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Question count must be between 1 and 20';
  END IF;
  IF seconds_per_question IS NULL OR seconds_per_question NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Time per question must be between 5 and 300 seconds';
  END IF;

  SELECT ARRAY(
    SELECT id FROM questions
    ORDER BY random()
    LIMIT question_count
  ) INTO selected_question_ids;

  IF COALESCE(array_length(selected_question_ids, 1), 0) < question_count THEN
    RAISE EXCEPTION 'Not enough battle questions available for the selected count';
  END IF;

  IF wager > 0 THEN
    PERFORM adjust_user_points(current_user_id, -wager, 'battle_wager_lock', '{}'::jsonb);
  END IF;

  INSERT INTO battle_rooms (creator_id, status, wager_points, question_ids, time_per_question_seconds)
  VALUES (current_user_id, 'waiting', wager, selected_question_ids, seconds_per_question)
  RETURNING * INTO created_room;

  RETURN created_room;
END;
$$;

REVOKE ALL ON FUNCTION public.create_battle_room(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_battle_room(integer, integer, integer) TO authenticated;

COMMIT;
