-- Public battle leaderboard. Raw answer history remains protected by RLS;
-- authenticated users receive aggregate ranking totals only.
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
  correct_answers AS (
    SELECT ps.user_id, count(*)::bigint AS total
    FROM public.session_answers sa
    JOIN public.practice_sessions ps ON ps.id = sa.session_id
    WHERE sa.is_correct IS TRUE AND ps.user_id IS NOT NULL
    GROUP BY ps.user_id

    UNION ALL

    SELECT es.user_id, count(*)::bigint AS total
    FROM public.exam_answers ea
    JOIN public.exam_sessions es ON es.id = ea.exam_session_id
    WHERE ea.is_correct IS TRUE AND es.user_id IS NOT NULL
    GROUP BY es.user_id

    UNION ALL

    SELECT ba.user_id, count(*)::bigint AS total
    FROM public.battle_answers ba
    WHERE ba.is_correct IS TRUE
    GROUP BY ba.user_id
  ),
  correct_totals AS (
    SELECT ca.user_id, sum(ca.total)::bigint AS total
    FROM correct_answers ca
    GROUP BY ca.user_id
  ),
  ranked AS (
    SELECT
      rank() OVER (
        ORDER BY COALESCE(w.total, 0) DESC, COALESCE(ct.total, 0) DESC
      ) AS position,
      p.id,
      p.name AS profile_name,
      COALESCE(w.total, 0)::bigint AS wins,
      COALESCE(ct.total, 0)::bigint AS correct
    FROM public.profiles p
    LEFT JOIN wins w ON w.winner_id = p.id
    LEFT JOIN correct_totals ct ON ct.user_id = p.id
  )
  SELECT r.position, r.id, r.profile_name, r.wins, r.correct
  FROM ranked r
  ORDER BY r.position, r.profile_name, r.id
  LIMIT LEAST(GREATEST(COALESCE(ranking_limit, 50), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_battle_rankings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_battle_rankings(integer) TO authenticated;
