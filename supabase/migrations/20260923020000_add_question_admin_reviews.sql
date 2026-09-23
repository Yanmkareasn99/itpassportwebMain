CREATE TABLE IF NOT EXISTS public.question_admin_reviews (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'editing', 'ready_for_review', 'needs_changes', 'approved')),
  message text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.question_admin_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_admin_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_admin_reviews TO authenticated;

DROP POLICY IF EXISTS "admins_select_question_reviews" ON public.question_admin_reviews;
CREATE POLICY "admins_select_question_reviews"
ON public.question_admin_reviews FOR SELECT
TO authenticated
USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admins_insert_question_reviews" ON public.question_admin_reviews;
CREATE POLICY "admins_insert_question_reviews"
ON public.question_admin_reviews FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admins_update_question_reviews" ON public.question_admin_reviews;
CREATE POLICY "admins_update_question_reviews"
ON public.question_admin_reviews FOR UPDATE
TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admins_delete_question_reviews" ON public.question_admin_reviews;
CREATE POLICY "admins_delete_question_reviews"
ON public.question_admin_reviews FOR DELETE
TO authenticated
USING ((SELECT public.is_admin()));

CREATE INDEX IF NOT EXISTS question_admin_reviews_status_idx
ON public.question_admin_reviews (review_status);
