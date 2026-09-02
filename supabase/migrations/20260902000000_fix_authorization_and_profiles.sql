/*
# Close content-management privilege gaps and provision profiles safely

This migration is intentionally forward-only so it also repairs databases that
have already applied the original permissive policies.
*/

-- Remove the original policies that allowed every authenticated user to mutate
-- learning content. The admins_* policies created in the previous migration
-- remain in force.
DROP POLICY IF EXISTS "insert_subjects" ON public.subjects;
DROP POLICY IF EXISTS "update_subjects" ON public.subjects;
DROP POLICY IF EXISTS "delete_subjects" ON public.subjects;

DROP POLICY IF EXISTS "insert_questions" ON public.questions;
DROP POLICY IF EXISTS "update_questions" ON public.questions;
DROP POLICY IF EXISTS "delete_questions" ON public.questions;

DROP POLICY IF EXISTS "insert_choices" ON public.answer_choices;
DROP POLICY IF EXISTS "update_choices" ON public.answer_choices;
DROP POLICY IF EXISTS "delete_choices" ON public.answer_choices;

-- Harden the helper used by RLS and RPCs against search-path substitution.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles AS p WHERE p.id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Profiles are created by a trusted trigger. Clients can update only the
-- editable profile columns, preventing changes to is_admin and role.
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admins_update_profiles" ON public.profiles;

CREATE POLICY "update_own_profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (name, student_id, class_name, avatar_url)
ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, student_id, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
      'User'
    ),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'student_id'), ''),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Repair OAuth or email-confirmation accounts created before this trigger.
INSERT INTO public.profiles (id, name, student_id, role)
SELECT
  u.id,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(u.email, '@', 1), ''),
    'User'
  ),
  NULLIF(BTRIM(u.raw_user_meta_data->>'student_id'), ''),
  'student'
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

-- Admin changes go through a checked RPC because authenticated users no longer
-- have column-level permission to update is_admin directly.
CREATE OR REPLACE FUNCTION public.set_profile_admin(
  target_user_id uuid,
  new_is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET is_admin = new_is_admin
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_admin(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_admin(uuid, boolean) TO authenticated;

-- The one-time import RPC bypassed RLS and was executable anonymously. Imports
-- now use a server-side service-role client instead.
REVOKE ALL ON FUNCTION public.import_questions_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_questions_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.import_questions_batch(jsonb) FROM authenticated;
DROP FUNCTION IF EXISTS public.import_questions_batch(jsonb);

-- Admin statistics need aggregate read access across users.
DROP POLICY IF EXISTS "admins_select_all_practice_sessions" ON public.practice_sessions;
CREATE POLICY "admins_select_all_practice_sessions" ON public.practice_sessions
FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admins_select_all_exam_sessions" ON public.exam_sessions;
CREATE POLICY "admins_select_all_exam_sessions" ON public.exam_sessions
FOR SELECT TO authenticated USING (public.is_admin());
