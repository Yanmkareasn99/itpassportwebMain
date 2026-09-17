-- Battle ranking correct-answer totals must come only from battle mode.
CREATE OR REPLACE FUNCTION public.get_battle_rankings(ranking_limit integer DEFAULT 50)
RETURNS TABLE (
  ranking_position bigint,
  user_id uuid,
  name text,
  win_count bigint,
  correct_answer_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  WITH wins AS (
    SELECT br.winner_id, count(*)::bigint AS total
    FROM public.battle_rooms br
    WHERE br.status = 'completed' AND br.winner_id IS NOT NULL
    GROUP BY br.winner_id
  ),
  battle_correct_answers AS (
    SELECT ba.user_id, count(*)::bigint AS total
    FROM public.battle_answers ba
    WHERE ba.is_correct IS TRUE
    GROUP BY ba.user_id
  ),
  ranked AS (
    SELECT
      rank() OVER (
        ORDER BY COALESCE(w.total, 0) DESC, COALESCE(bca.total, 0) DESC
      ) AS position,
      p.id,
      p.name AS profile_name,
      COALESCE(w.total, 0)::bigint AS wins,
      COALESCE(bca.total, 0)::bigint AS correct
    FROM public.profiles p
    LEFT JOIN wins w ON w.winner_id = p.id
    LEFT JOIN battle_correct_answers bca ON bca.user_id = p.id
  )
  SELECT r.position, r.id, r.profile_name, r.wins, r.correct
  FROM ranked r
  ORDER BY r.position, r.profile_name, r.id
  LIMIT LEAST(GREATEST(COALESCE(ranking_limit, 50), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_battle_rankings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_battle_rankings(integer) TO authenticated;
