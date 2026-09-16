-- Material binaries are now stored by files.manabi-app.jp. The API writes
-- year/month/random-name paths and records the MIME type detected by PHP.
ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_owner_path;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_mime_type_check;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_storage_path_check;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_storage_path_check CHECK (
    storage_path ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f]{40}\.(pdf|png|jpg|docx|pptx|xlsx)$'
    OR storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  ADD CONSTRAINT materials_mime_type_check CHECK (mime_type IN (
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
    'image/webp',
    'text/plain',
    'video/mp4'
  ));
