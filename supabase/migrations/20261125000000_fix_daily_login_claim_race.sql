-- Serialize daily-login claims per user so concurrent auth callbacks cannot
-- award the same user more than once. Daily rewards follow the Japan calendar.
CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  award_date date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  last_awarded_on date;
  balance_after int;
  daily_points int;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.profile_points (user_id, balance, last_daily_awarded_on)
  VALUES (current_user_id, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Keep this lock until the transaction finishes. A simultaneous claim for
  -- the same user waits here, then observes the date written by the first one.
  SELECT balance, last_daily_awarded_on
  INTO balance_after, last_awarded_on
  FROM public.profile_points
  WHERE user_id = current_user_id
  FOR UPDATE;

  IF last_awarded_on = award_date THEN
    RETURN balance_after;
  END IF;

  daily_points := public.get_point_setting('daily_login_points');
  balance_after := public.adjust_user_points(
    current_user_id,
    daily_points,
    'daily_login',
    jsonb_build_object('award_date', award_date)
  );

  UPDATE public.profile_points
  SET last_daily_awarded_on = award_date,
      updated_at = now()
  WHERE user_id = current_user_id;

  RETURN balance_after;
END;
$$;
