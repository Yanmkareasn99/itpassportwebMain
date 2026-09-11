CREATE TABLE IF NOT EXISTS public.study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  description text,
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_study_materials" ON public.study_materials;
CREATE POLICY "authenticated_select_study_materials"
ON public.study_materials FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "teachers_insert_study_materials" ON public.study_materials;
CREATE POLICY "teachers_insert_study_materials"
ON public.study_materials FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'teacher')
  )
);

DROP POLICY IF EXISTS "teachers_delete_study_materials" ON public.study_materials;
CREATE POLICY "teachers_delete_study_materials"
ON public.study_materials FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'teacher')
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'study-materials',
  'study-materials',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "authenticated_select_study_material_files" ON storage.objects;
CREATE POLICY "authenticated_select_study_material_files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'study-materials');

DROP POLICY IF EXISTS "teachers_insert_study_material_files" ON storage.objects;
CREATE POLICY "teachers_insert_study_material_files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'study-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'teacher')
  )
);

DROP POLICY IF EXISTS "teachers_delete_study_material_files" ON storage.objects;
CREATE POLICY "teachers_delete_study_material_files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'study-materials'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'teacher')
  )
);
