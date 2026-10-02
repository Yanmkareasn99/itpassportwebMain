ALTER TABLE public.bug_report_comments
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.bug_report_comments
SET updated_at = created_at
WHERE updated_at IS DISTINCT FROM created_at;

GRANT UPDATE, DELETE ON TABLE public.bug_report_comments TO authenticated;

DROP POLICY IF EXISTS "comment_authors_update_comments" ON public.bug_report_comments;
CREATE POLICY "comment_authors_update_comments"
ON public.bug_report_comments FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (
  author_id = auth.uid()
  AND author_name = (SELECT name FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "comment_authors_or_admins_delete_comments" ON public.bug_report_comments;
CREATE POLICY "comment_authors_or_admins_delete_comments"
ON public.bug_report_comments FOR DELETE TO authenticated
USING (author_id = auth.uid() OR (SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.touch_bug_report_from_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_issue_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_issue_id := OLD.issue_id;
  ELSE
    target_issue_id := NEW.issue_id;
  END IF;

  UPDATE public.bug_reports SET updated_at = now() WHERE id = target_issue_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS touch_bug_report_after_comment ON public.bug_report_comments;
CREATE TRIGGER touch_bug_report_after_comment
AFTER INSERT OR UPDATE OR DELETE ON public.bug_report_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_bug_report_from_comment();
