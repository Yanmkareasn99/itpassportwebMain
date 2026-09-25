-- Allow an HTTPS link to be shared when uploading to the material file server
-- is unavailable. A material is either an uploaded file or an external link.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS external_url text;

ALTER TABLE public.materials
  ALTER COLUMN file_name DROP NOT NULL,
  ALTER COLUMN mime_type DROP NOT NULL,
  ALTER COLUMN file_size DROP NOT NULL,
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_storage_path_check,
  DROP CONSTRAINT IF EXISTS materials_source_check,
  ADD CONSTRAINT materials_storage_path_check CHECK (
    storage_path IS NULL
    OR storage_path ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f]{40}\.(pdf|png|jpg|docx|pptx|xlsx)$'
    OR storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  ADD CONSTRAINT materials_source_check CHECK (
    (
      external_url IS NULL
      AND file_name IS NOT NULL
      AND mime_type IS NOT NULL
      AND file_size IS NOT NULL
      AND storage_path IS NOT NULL
    )
    OR
    (
      external_url ~ '^https://[^[:space:]]+$'
      AND char_length(external_url) <= 2048
      AND file_name IS NULL
      AND mime_type IS NULL
      AND file_size IS NULL
      AND storage_path IS NULL
    )
  );

DROP POLICY IF EXISTS "users_delete_material_links" ON public.materials;
CREATE POLICY "users_delete_material_links" ON public.materials
  FOR DELETE TO authenticated
  USING (
    external_url IS NOT NULL
    AND (uploader_id = auth.uid() OR (SELECT public.is_admin()))
  );
