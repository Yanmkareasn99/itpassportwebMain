BEGIN;

ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS abandoning_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS abandonment_deadline_at timestamptz;

ALTER TABLE public.battle_rooms
  ADD CONSTRAINT battle_rooms_abandonment_pair_check CHECK (
    (abandoning_user_id IS NULL AND abandonment_deadline_at IS NULL)
    OR (abandoning_user_id IS NOT NULL AND abandonment_deadline_at IS NOT NULL)
  ),
  ADD CONSTRAINT battle_rooms_abandoning_participant_check CHECK (
    abandoning_user_id IS NULL
    OR abandoning_user_id = creator_id
    OR abandoning_user_id = opponent_id
  );

CREATE INDEX IF NOT EXISTS battle_rooms_abandonment_deadline_idx
  ON public.battle_rooms (abandonment_deadline_at)
  WHERE status = 'active' AND abandoning_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.settle_battle_abandonment(
  target_room_id uuid,
  require_expired boolean DEFAULT false
)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room battle_rooms;
  winner uuid;
BEGIN
  SELECT * INTO room
  FROM public.battle_rooms
  WHERE id = target_room_id
  FOR UPDATE;

  IF room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room not found';
  END IF;
  IF room.status <> 'active' OR room.abandoning_user_id IS NULL THEN
    RETURN room;
  END IF;
  IF require_expired AND room.abandonment_deadline_at > now() THEN
    RETURN room;
  END IF;

  winner := CASE
    WHEN room.abandoning_user_id = room.creator_id THEN room.opponent_id
    ELSE room.creator_id
  END;

  UPDATE public.battle_rooms
  SET status = 'completed',
      winner_id = winner,
      completed_at = now()
  WHERE id = target_room_id
    AND status = 'active'
  RETURNING * INTO room;

  IF room.wager_points > 0 AND winner IS NOT NULL THEN
    PERFORM public.adjust_user_points(
      winner,
      room.wager_points * 2,
      'battle_win_payout',
      jsonb_build_object(
        'room_id', target_room_id,
        'abandoned_user_id', room.abandoning_user_id
      )
    );
  END IF;

  RETURN room;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_battle_abandonment(uuid, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.leave_active_battle_room(target_room_id uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  room battle_rooms;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO room
  FROM public.battle_rooms
  WHERE id = target_room_id
  FOR UPDATE;

  IF room.id IS NULL OR room.status <> 'active' THEN
    RAISE EXCEPTION 'Battle room is not active';
  END IF;
  IF current_user_id <> room.creator_id AND current_user_id <> room.opponent_id THEN
    RAISE EXCEPTION 'You are not in this battle';
  END IF;
  IF room.abandoning_user_id IS NOT NULL AND room.abandoning_user_id <> current_user_id THEN
    RAISE EXCEPTION 'Your opponent has already left this battle';
  END IF;
  IF room.abandoning_user_id = current_user_id THEN
    RETURN room;
  END IF;

  UPDATE public.battle_rooms
  SET abandoning_user_id = current_user_id,
      abandonment_deadline_at = now() + interval '3 minutes'
  WHERE id = target_room_id
  RETURNING * INTO room;

  RETURN room;
END;
$$;

CREATE OR REPLACE FUNCTION public.rejoin_active_battle_room(target_room_id uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  room battle_rooms;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO room
  FROM public.battle_rooms
  WHERE id = target_room_id
  FOR UPDATE;

  IF room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room not found';
  END IF;
  IF room.status = 'completed' THEN
    RETURN room;
  END IF;
  IF room.status <> 'active' OR room.abandoning_user_id IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'You do not have a battle waiting to be rejoined';
  END IF;

  IF room.abandonment_deadline_at <= now() THEN
    SELECT * INTO room
    FROM public.settle_battle_abandonment(target_room_id, true);
    RETURN room;
  END IF;

  UPDATE public.battle_rooms
  SET abandoning_user_id = NULL,
      abandonment_deadline_at = NULL
  WHERE id = target_room_id
  RETURNING * INTO room;

  RETURN room;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_active_battle_room(target_room_id uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  room battle_rooms;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO room
  FROM public.battle_rooms
  WHERE id = target_room_id
  FOR UPDATE;

  IF room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room not found';
  END IF;
  IF room.status = 'completed' THEN
    RETURN room;
  END IF;
  IF room.status <> 'active' OR room.abandoning_user_id IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Leave the battle before abandoning it';
  END IF;

  SELECT * INTO room
  FROM public.settle_battle_abandonment(target_room_id, false);
  RETURN room;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_abandoned_battle_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  stale_room record;
  settled_room battle_rooms;
  expired_count integer := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOR stale_room IN
    SELECT id
    FROM public.battle_rooms
    WHERE status = 'active'
      AND abandoning_user_id IS NOT NULL
      AND abandonment_deadline_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO settled_room
    FROM public.settle_battle_abandonment(stale_room.id, true);
    IF settled_room.status = 'completed' THEN
      expired_count := expired_count + 1;
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_active_battle_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rejoin_active_battle_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abandon_active_battle_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_abandoned_battle_rooms() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.leave_active_battle_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejoin_active_battle_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_active_battle_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_battle_rooms() TO authenticated;

COMMIT;
