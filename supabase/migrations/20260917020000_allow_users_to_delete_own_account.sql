/*
# Allow authenticated users to delete only their own account

There is deliberately no user-id parameter. The function derives the target
from the caller's verified JWT. User-private records cascade, while uploaded
shared materials are retained and become ownerless.
*/

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_uploader_id_fkey;

ALTER TABLE public.materials
  ALTER COLUMN uploader_id DROP NOT NULL;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_uploader_id_fkey
  FOREIGN KEY (uploader_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.users
  WHERE id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
