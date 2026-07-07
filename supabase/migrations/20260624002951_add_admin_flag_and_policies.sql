/*
# Add Admin Support

1. Changes to `profiles`
   - Add `is_admin` boolean column (default false) so certain users can be granted admin access.

2. RLS policy updates for content tables
   - `questions`: admins can INSERT, UPDATE, DELETE (in addition to existing authenticated SELECT).
   - `answer_choices`: admins can INSERT, UPDATE, DELETE (in addition to existing authenticated SELECT).
   - `subjects`: admins can INSERT, UPDATE, DELETE (in addition to existing authenticated SELECT).

3. Helper function
   - `is_admin()` function checks `profiles.is_admin` for the current user, used in policies to avoid repeated subqueries.

4. Security notes
   - Only users with `is_admin = true` in `profiles` can mutate content tables.
   - Regular students retain read-only access to all content tables.
*/

-- Add is_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Helper function so RLS policies stay readable
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ── questions ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_insert_questions" ON questions;
CREATE POLICY "admins_insert_questions" ON questions FOR INSERT
TO authenticated
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_update_questions" ON questions;
CREATE POLICY "admins_update_questions" ON questions FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_delete_questions" ON questions;
CREATE POLICY "admins_delete_questions" ON questions FOR DELETE
TO authenticated
USING (is_admin());

-- ── answer_choices ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_insert_answer_choices" ON answer_choices;
CREATE POLICY "admins_insert_answer_choices" ON answer_choices FOR INSERT
TO authenticated
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_update_answer_choices" ON answer_choices;
CREATE POLICY "admins_update_answer_choices" ON answer_choices FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_delete_answer_choices" ON answer_choices;
CREATE POLICY "admins_delete_answer_choices" ON answer_choices FOR DELETE
TO authenticated
USING (is_admin());

-- ── subjects ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admins_insert_subjects" ON subjects;
CREATE POLICY "admins_insert_subjects" ON subjects FOR INSERT
TO authenticated
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_update_subjects" ON subjects;
CREATE POLICY "admins_update_subjects" ON subjects FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins_delete_subjects" ON subjects;
CREATE POLICY "admins_delete_subjects" ON subjects FOR DELETE
TO authenticated
USING (is_admin());

-- ── profiles: admins can read all profiles ─────────────────────────────────────
DROP POLICY IF EXISTS "admins_select_all_profiles" ON profiles;
CREATE POLICY "admins_select_all_profiles" ON profiles FOR SELECT
TO authenticated
USING (is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "admins_update_profiles" ON profiles;
CREATE POLICY "admins_update_profiles" ON profiles FOR UPDATE
TO authenticated
USING (is_admin() OR auth.uid() = id)
WITH CHECK (is_admin() OR auth.uid() = id);
