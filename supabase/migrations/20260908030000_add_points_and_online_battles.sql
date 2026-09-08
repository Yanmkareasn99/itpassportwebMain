-- Points economy and real online battle support.

CREATE TABLE IF NOT EXISTS point_settings (
  key text PRIMARY KEY,
  value int NOT NULL CHECK (value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO point_settings (key, value)
VALUES
  ('daily_login_points', 100),
  ('practice_correct_points', 50),
  ('practice_wrong_points', 10),
  ('mock_correct_points', 50),
  ('mock_wrong_points', 10)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE point_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_point_settings" ON point_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_update_point_settings" ON point_settings
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE TABLE IF NOT EXISTS profile_points (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_daily_awarded_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profile_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_points" ON profile_points
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL,
  balance_after int NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE point_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_point_ledger" ON point_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS wager_points int NOT NULL DEFAULT 0 CHECK (wager_points >= 0);
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS question_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE battle_rooms ADD COLUMN IF NOT EXISTS started_at timestamptz;

DROP POLICY IF EXISTS "select_battle_profiles" ON profiles;
CREATE POLICY "select_battle_profiles" ON profiles
  FOR SELECT TO authenticated USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM battle_rooms
      WHERE battle_rooms.creator_id = profiles.id
        AND battle_rooms.status = 'waiting'
    )
    OR EXISTS (
      SELECT 1 FROM battle_rooms
      WHERE battle_rooms.status IN ('active', 'completed')
        AND (battle_rooms.creator_id = auth.uid() OR battle_rooms.opponent_id = auth.uid())
        AND (battle_rooms.creator_id = profiles.id OR battle_rooms.opponent_id = profiles.id)
    )
  );

CREATE TABLE IF NOT EXISTS battle_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_choice_id uuid REFERENCES answer_choices(id) ON DELETE SET NULL,
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, question_id)
);

ALTER TABLE battle_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE battle_rooms;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE battle_answers;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

CREATE POLICY "select_participant_battle_answers" ON battle_answers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM battle_rooms
      WHERE battle_rooms.id = battle_answers.room_id
      AND (battle_rooms.creator_id = auth.uid() OR battle_rooms.opponent_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION get_point_setting(setting_key text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value FROM point_settings WHERE key = setting_key), 0);
$$;

CREATE OR REPLACE FUNCTION adjust_user_points(target_user_id uuid, point_delta int, point_reason text, point_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance int;
BEGIN
  INSERT INTO profile_points (user_id, balance)
  VALUES (target_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE profile_points
  SET balance = balance + point_delta,
      updated_at = now()
  WHERE user_id = target_user_id
    AND balance + point_delta >= 0
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  INSERT INTO point_ledger (user_id, delta, reason, balance_after, metadata)
  VALUES (target_user_id, point_delta, point_reason, new_balance, point_metadata);

  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION adjust_user_points(uuid, int, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION claim_daily_login()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  daily_points int := get_point_setting('daily_login_points');
  balance_after int;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO profile_points (user_id, balance, last_daily_awarded_on)
  VALUES (current_user_id, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM profile_points
    WHERE user_id = current_user_id
      AND last_daily_awarded_on = CURRENT_DATE
  ) THEN
    SELECT balance INTO balance_after FROM profile_points WHERE user_id = current_user_id;
    RETURN balance_after;
  END IF;

  balance_after := adjust_user_points(current_user_id, daily_points, 'daily_login', '{}'::jsonb);

  UPDATE profile_points
  SET last_daily_awarded_on = CURRENT_DATE,
      updated_at = now()
  WHERE user_id = current_user_id;

  RETURN balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION award_practice_answer_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  answer_user_id uuid;
  points_to_award int;
BEGIN
  SELECT user_id INTO answer_user_id
  FROM practice_sessions
  WHERE id = NEW.session_id;

  IF answer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  points_to_award := get_point_setting(
    CASE WHEN NEW.is_correct THEN 'practice_correct_points' ELSE 'practice_wrong_points' END
  );

  PERFORM adjust_user_points(answer_user_id, points_to_award, 'practice_answer', jsonb_build_object('question_id', NEW.question_id, 'is_correct', NEW.is_correct));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_answer_points_trigger ON session_answers;
CREATE TRIGGER session_answer_points_trigger
AFTER INSERT ON session_answers
FOR EACH ROW EXECUTE FUNCTION award_practice_answer_points();

CREATE OR REPLACE FUNCTION award_exam_answer_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  answer_user_id uuid;
  points_to_award int;
BEGIN
  SELECT user_id INTO answer_user_id
  FROM exam_sessions
  WHERE id = NEW.exam_session_id;

  IF answer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  points_to_award := get_point_setting(
    CASE WHEN NEW.is_correct THEN 'mock_correct_points' ELSE 'mock_wrong_points' END
  );

  PERFORM adjust_user_points(answer_user_id, points_to_award, 'mock_answer', jsonb_build_object('question_id', NEW.question_id, 'is_correct', NEW.is_correct));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_answer_points_trigger ON exam_answers;
CREATE TRIGGER exam_answer_points_trigger
AFTER INSERT ON exam_answers
FOR EACH ROW EXECUTE FUNCTION award_exam_answer_points();

CREATE OR REPLACE FUNCTION create_battle_room(wager int DEFAULT 0, question_count int DEFAULT 5)
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
  IF wager < 0 THEN
    RAISE EXCEPTION 'Wager must be zero or more';
  END IF;

  SELECT ARRAY(
    SELECT id FROM questions
    ORDER BY random()
    LIMIT GREATEST(1, LEAST(question_count, 20))
  ) INTO selected_question_ids;

  IF array_length(selected_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No battle questions available';
  END IF;

  IF wager > 0 THEN
    PERFORM adjust_user_points(current_user_id, -wager, 'battle_wager_lock', '{}'::jsonb);
  END IF;

  INSERT INTO battle_rooms (creator_id, status, wager_points, question_ids)
  VALUES (current_user_id, 'waiting', wager, selected_question_ids)
  RETURNING * INTO created_room;

  RETURN created_room;
END;
$$;

CREATE OR REPLACE FUNCTION join_battle_room(target_room_id uuid)
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

  SELECT * INTO joined_room
  FROM battle_rooms
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
    PERFORM adjust_user_points(current_user_id, -joined_room.wager_points, 'battle_wager_lock', jsonb_build_object('room_id', target_room_id));
  END IF;

  UPDATE battle_rooms
  SET opponent_id = current_user_id,
      status = 'active',
      started_at = now()
  WHERE id = target_room_id
  RETURNING * INTO joined_room;

  RETURN joined_room;
END;
$$;

CREATE OR REPLACE FUNCTION submit_battle_answer(target_room_id uuid, target_question_id uuid, selected_choice uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  room battle_rooms;
  correct boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO room FROM battle_rooms WHERE id = target_room_id FOR UPDATE;

  IF room.id IS NULL OR room.status <> 'active' THEN
    RAISE EXCEPTION 'Battle room is not active';
  END IF;
  IF current_user_id <> room.creator_id AND current_user_id <> room.opponent_id THEN
    RAISE EXCEPTION 'You are not in this battle';
  END IF;
  IF NOT (target_question_id = ANY(room.question_ids)) THEN
    RAISE EXCEPTION 'Question is not part of this battle';
  END IF;

  SELECT COALESCE(is_correct, false) INTO correct
  FROM answer_choices
  WHERE id = selected_choice
    AND question_id = target_question_id;

  INSERT INTO battle_answers (room_id, user_id, question_id, selected_choice_id, is_correct)
  VALUES (target_room_id, current_user_id, target_question_id, selected_choice, COALESCE(correct, false))
  ON CONFLICT (room_id, user_id, question_id) DO NOTHING;

  UPDATE battle_rooms
  SET creator_score = (
        SELECT count(*) FROM battle_answers
        WHERE room_id = target_room_id AND user_id = room.creator_id AND is_correct = true
      ),
      opponent_score = (
        SELECT count(*) FROM battle_answers
        WHERE room_id = target_room_id AND user_id = room.opponent_id AND is_correct = true
      )
  WHERE id = target_room_id
  RETURNING * INTO room;

  RETURN room;
END;
$$;

CREATE OR REPLACE FUNCTION complete_battle_room(target_room_id uuid)
RETURNS battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  room battle_rooms;
  answer_target int;
  winner uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO room FROM battle_rooms WHERE id = target_room_id FOR UPDATE;

  IF room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room not found';
  END IF;
  IF room.opponent_id IS NULL THEN
    RAISE EXCEPTION 'Battle room has no opponent';
  END IF;
  IF current_user_id <> room.creator_id AND current_user_id <> room.opponent_id THEN
    RAISE EXCEPTION 'You are not in this battle';
  END IF;
  IF room.status = 'completed' THEN
    RETURN room;
  END IF;

  answer_target := COALESCE(array_length(room.question_ids, 1), 0);
  IF answer_target = 0 THEN
    RAISE EXCEPTION 'Battle has no questions';
  END IF;

  UPDATE battle_rooms
  SET creator_score = (
        SELECT count(*) FROM battle_answers
        WHERE room_id = target_room_id AND user_id = room.creator_id AND is_correct = true
      ),
      opponent_score = (
        SELECT count(*) FROM battle_answers
        WHERE room_id = target_room_id AND user_id = room.opponent_id AND is_correct = true
      )
  WHERE id = target_room_id
  RETURNING * INTO room;

  IF room.creator_score > room.opponent_score THEN
    winner := room.creator_id;
  ELSIF room.opponent_score > room.creator_score THEN
    winner := room.opponent_id;
  ELSE
    winner := NULL;
  END IF;

  UPDATE battle_rooms
  SET status = 'completed',
      winner_id = winner,
      completed_at = now()
  WHERE id = target_room_id
  RETURNING * INTO room;

  IF room.wager_points > 0 THEN
    IF winner IS NULL THEN
      PERFORM adjust_user_points(room.creator_id, room.wager_points, 'battle_draw_refund', jsonb_build_object('room_id', target_room_id));
      PERFORM adjust_user_points(room.opponent_id, room.wager_points, 'battle_draw_refund', jsonb_build_object('room_id', target_room_id));
    ELSE
      PERFORM adjust_user_points(winner, room.wager_points * 2, 'battle_win_payout', jsonb_build_object('room_id', target_room_id));
    END IF;
  END IF;

  RETURN room;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_battle_room(target_room_id uuid)
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
  FROM battle_rooms
  WHERE id = target_room_id
  FOR UPDATE;

  IF room.id IS NULL THEN
    RAISE EXCEPTION 'Battle room not found';
  END IF;
  IF room.creator_id <> current_user_id THEN
    RAISE EXCEPTION 'Only the room creator can cancel this room';
  END IF;
  IF room.status <> 'waiting' THEN
    RAISE EXCEPTION 'Only waiting rooms can be cancelled';
  END IF;

  UPDATE battle_rooms
  SET status = 'completed',
      completed_at = now()
  WHERE id = target_room_id
  RETURNING * INTO room;

  IF room.wager_points > 0 THEN
    PERFORM adjust_user_points(current_user_id, room.wager_points, 'battle_cancel_refund', jsonb_build_object('room_id', target_room_id));
  END IF;

  RETURN room;
END;
$$;
