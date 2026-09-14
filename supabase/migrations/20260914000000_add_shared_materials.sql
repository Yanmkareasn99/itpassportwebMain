-- Shared study files are private to signed-in learners, including their URLs.
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'video/mp4'
  )),
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materials_owner_path CHECK (storage_path = uploader_id::text || '/' || id::text)
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

Drop POLICY IF EXISTS "authenticated_read_materials" ON public.materials;
Drop POLICY IF EXISTS "users_insert_materials" ON public.materials;
CREATE POLICY "authenticated_read_materials" ON public.materials
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert_materials" ON public.materials
  FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials', 'materials', false, 20971520,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "authenticated_read_material_files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'materials');
CREATE POLICY "users_upload_material_files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'materials'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND array_length(storage.foldername(name), 1) = 1
  );
CREATE POLICY "users_remove_material_files" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text
  );
