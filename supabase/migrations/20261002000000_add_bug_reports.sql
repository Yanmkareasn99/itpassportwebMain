CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_name text NOT NULL CHECK (char_length(reporter_name) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  details text NOT NULL CHECK (char_length(details) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  labels text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (labels <@ ARRAY['bug', 'ui', 'content', 'performance', 'accessibility', 'other']::text[])
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bug_reports FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bug_reports TO authenticated;

DROP POLICY IF EXISTS "users_read_own_or_admin_reads_all_bug_reports" ON public.bug_reports;
CREATE POLICY "users_read_own_or_admin_reads_all_bug_reports"
ON public.bug_reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "users_create_own_bug_reports" ON public.bug_reports;
CREATE POLICY "users_create_own_bug_reports"
ON public.bug_reports FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = reporter_id
  AND status = 'open'
  AND reporter_name = (SELECT name FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "admins_update_bug_reports" ON public.bug_reports;
CREATE POLICY "admins_update_bug_reports"
ON public.bug_reports FOR UPDATE TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE INDEX IF NOT EXISTS bug_reports_status_updated_idx
ON public.bug_reports (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS bug_reports_reporter_updated_idx
ON public.bug_reports (reporter_id, updated_at DESC);
