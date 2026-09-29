ALTER TABLE public.question_admin_reviews
ADD COLUMN IF NOT EXISTS updated_by uuid
REFERENCES public.profiles(id) ON DELETE SET NULL;
