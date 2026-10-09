GRANT DELETE ON TABLE public.bug_reports TO authenticated;

DROP POLICY IF EXISTS "reporters_or_admins_delete_bug_reports" ON public.bug_reports;
CREATE POLICY "reporters_or_admins_delete_bug_reports"
ON public.bug_reports FOR DELETE TO authenticated
USING (reporter_id = auth.uid() OR (SELECT public.is_admin()));
