BEGIN;

CREATE OR REPLACE FUNCTION public.expire_stale_battle_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  expired_room record;
  expired_count integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOR expired_room IN
    UPDATE public.battle_rooms
    SET status = 'completed',
        completed_at = now()
    WHERE status = 'waiting'
      AND created_at <= now() - interval '15 minutes'
    RETURNING id, creator_id, wager_points
  LOOP
    IF expired_room.wager_points > 0 THEN
      PERFORM public.adjust_user_points(
        expired_room.creator_id,
        expired_room.wager_points,
        'battle_expired_refund',
        jsonb_build_object('room_id', expired_room.id)
      );
    END IF;
    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_battle_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_battle_rooms() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_battle_room(wager int, question_count int, seconds_per_question int)
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
    RAISE EXCEPTION 'Wager must be a non-negative integer';
  END IF;
  IF question_count IS NULL OR question_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Question count must be between 1 and 20';
  END IF;
  IF seconds_per_question IS NULL OR seconds_per_question NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Time per question must be between 5 and 300 seconds';
  END IF;

  PERFORM public.expire_stale_battle_rooms();

  -- Serialize room creation per user so concurrent clicks cannot lock two wagers.
  PERFORM pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.battle_rooms
    WHERE creator_id = current_user_id AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'You already have a waiting battle room';
  END IF;

  SELECT ARRAY(
    SELECT id FROM public.questions
    ORDER BY random()
    LIMIT question_count
  ) INTO selected_question_ids;

  IF COALESCE(array_length(selected_question_ids, 1), 0) < question_count THEN
    RAISE EXCEPTION 'Not enough battle questions available for the selected count';
  END IF;

  IF wager > 0 THEN
    PERFORM public.adjust_user_points(current_user_id, -wager, 'battle_wager_lock', '{}'::jsonb);
  END IF;

  INSERT INTO public.battle_rooms (creator_id, status, wager_points, question_ids, time_per_question_seconds)
  VALUES (current_user_id, 'waiting', wager, selected_question_ids, seconds_per_question)
  RETURNING * INTO created_room;

  RETURN created_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_battle_room(target_room_id uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  joined_room battle_rooms;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.expire_stale_battle_rooms();

  SELECT * INTO joined_room
  FROM public.battle_rooms
  WHERE id = target_room_id
    AND status = 'waiting'
  FOR UPDATE;

  IF joined_room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room is no longer available';
  END IF;
  IF joined_room.creator_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot join your own room';
  END IF;

  IF joined_room.wager_points > 0 THEN
    PERFORM public.adjust_user_points(
      current_user_id,
      -joined_room.wager_points,
      'battle_wager_lock',
      jsonb_build_object('room_id', target_room_id)
    );
  END IF;

  UPDATE public.battle_rooms
  SET opponent_id = current_user_id,
      status = 'active',
      started_at = now()
  WHERE id = target_room_id
  RETURNING * INTO joined_room;

  RETURN joined_room;
END;
$$;

COMMIT;
