CREATE TABLE IF NOT EXISTS public.bug_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_report_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bug_report_comments FROM anon;
GRANT SELECT, INSERT ON TABLE public.bug_report_comments TO authenticated;

DROP POLICY IF EXISTS "issue_participants_read_comments" ON public.bug_report_comments;
CREATE POLICY "issue_participants_read_comments"
ON public.bug_report_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bug_reports
    WHERE bug_reports.id = bug_report_comments.issue_id
      AND (bug_reports.reporter_id = auth.uid() OR (SELECT public.is_admin()))
  )
);

DROP POLICY IF EXISTS "issue_participants_create_comments" ON public.bug_report_comments;
CREATE POLICY "issue_participants_create_comments"
ON public.bug_report_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND author_name = (SELECT name FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bug_reports
    WHERE bug_reports.id = bug_report_comments.issue_id
      AND (bug_reports.reporter_id = auth.uid() OR (SELECT public.is_admin()))
  )
);

CREATE INDEX IF NOT EXISTS bug_report_comments_issue_created_idx
ON public.bug_report_comments (issue_id, created_at);

CREATE OR REPLACE FUNCTION public.touch_bug_report_from_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bug_reports SET updated_at = NEW.created_at WHERE id = NEW.issue_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_bug_report_after_comment ON public.bug_report_comments;
CREATE TRIGGER touch_bug_report_after_comment
AFTER INSERT ON public.bug_report_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_bug_report_from_comment();
