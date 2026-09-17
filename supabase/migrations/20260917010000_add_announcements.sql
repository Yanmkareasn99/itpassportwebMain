-- Scheduled, localized announcements shown on the home page.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ja text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  title_vi text NOT NULL DEFAULT '',
  message_ja text NOT NULL DEFAULT '',
  message_en text NOT NULL DEFAULT '',
  message_vi text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_message_required CHECK (
    length(btrim(message_ja)) > 0
    OR length(btrim(message_en)) > 0
    OR length(btrim(message_vi)) > 0
  ),
  CONSTRAINT announcements_date_order CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS announcements_active_schedule_idx
ON public.announcements (is_active, priority DESC, starts_at, ends_at);

CREATE OR REPLACE FUNCTION public.set_announcement_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_announcement_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_current_announcements" ON public.announcements;
CREATE POLICY "authenticated_read_current_announcements" ON public.announcements
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    is_active
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  )
);

DROP POLICY IF EXISTS "admins_insert_announcements" ON public.announcements;
CREATE POLICY "admins_insert_announcements" ON public.announcements
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins_update_announcements" ON public.announcements;
CREATE POLICY "admins_update_announcements" ON public.announcements
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins_delete_announcements" ON public.announcements;
CREATE POLICY "admins_delete_announcements" ON public.announcements
FOR DELETE TO authenticated USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcements TO authenticated;
