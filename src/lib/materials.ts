import { isSupabaseEnabled, supabase } from './supabase';

export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;
export const MATERIAL_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
] as const;

const MATERIAL_EXTENSIONS: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ],
};

const materialFilesUrl = (import.meta.env.VITE_MATERIAL_FILES_URL || 'https://files.learnwithmanabi.com').replace(/\/$/, '');

export interface Material {
  id: string;
  uploader_id: string | null;
  title: string;
  description: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  external_url: string | null;
  created_at: string;
}

function requireSharedStorage() {
  if (!isSupabaseEnabled) throw new Error('Shared materials require Supabase to be enabled.');
}

export type MaterialFileProblem = 'invalidType' | 'emptyFile' | 'fileTooLarge';
export type MaterialLinkProblem = 'invalidLink' | 'insecureLink' | 'linkTooLong';

const fileProblemMessages: Record<MaterialFileProblem, string> = {
  invalidType: 'Choose a PDF, PNG, JPEG, DOCX, PPTX, or XLSX file.',
  emptyFile: 'Choose a file that is not empty.',
  fileTooLarge: 'Files must be 20 MB or smaller.',
};

export function validateMaterialFile(file: File): MaterialFileProblem | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowedMimeTypes = MATERIAL_EXTENSIONS[extension];
  if (!allowedMimeTypes || (file.type !== '' && !allowedMimeTypes.includes(file.type))) {
    return 'invalidType';
  }
  if (file.size === 0) return 'emptyFile';
  if (file.size > MATERIAL_MAX_BYTES) return 'fileTooLarge';
  return null;
}

export function validateMaterialLink(value: string): MaterialLinkProblem | null {
  const cleanUrl = value.trim();
  if (cleanUrl.length > 2048) return 'linkTooLong';
  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return 'invalidLink';
  }
  if (parsed.protocol !== 'https:') return 'insecureLink';
  if (!parsed.hostname || parsed.username || parsed.password) return 'invalidLink';
  return null;
}

export async function listMaterials(): Promise<Material[]> {
  requireSharedStorage();
  const { data, error } = await supabase.from('materials').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Material[];
}

export async function uploadMaterial(file: File, title: string, description: string): Promise<void> {
  requireSharedStorage();
  const problem = validateMaterialFile(file);
  if (problem) throw new Error(fileProblemMessages[problem]);
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error('Enter a title of up to 120 characters.');
  if (cleanDescription.length > 500) throw new Error('Description must be 500 characters or shorter.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Sign in again before uploading a material.');

  const body = new FormData();
  body.append('file', file);
  body.append('title', cleanTitle);
  body.append('description', cleanDescription);

  const response = await fetch(`${materialFilesUrl}/api/upload.php`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body,
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || 'The material could not be uploaded.');
}

export async function shareMaterialLink(url: string, title: string, description: string): Promise<void> {
  requireSharedStorage();
  const cleanUrl = url.trim();
  const linkProblem = validateMaterialLink(cleanUrl);
  if (linkProblem) throw new Error('Enter a valid HTTPS link of up to 2,048 characters.');
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error('Enter a title of up to 120 characters.');
  if (cleanDescription.length > 500) throw new Error('Description must be 500 characters or shorter.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.id) throw new Error('Sign in again before sharing a material.');

  const { error } = await supabase.from('materials').insert({
    uploader_id: session.user.id,
    title: cleanTitle,
    description: cleanDescription || null,
    external_url: cleanUrl,
  });
  if (error) throw error;
}

export async function deleteMaterial(material: Material | string): Promise<void> {
  requireSharedStorage();
  if (typeof material !== 'string' && material.external_url) {
    const { error } = await supabase.from('materials').delete().eq('id', material.id);
    if (error) throw error;
    return;
  }
  const materialId = typeof material === 'string' ? material : material.id;
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error('Sign in again before deleting a material.');

  const response = await fetch(
    `${materialFilesUrl}/api/delete.php?id=${encodeURIComponent(materialId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || 'The material could not be deleted.');
}

export async function materialUrl(material: Material, download = false): Promise<string> {
  requireSharedStorage();
  if (material.external_url) return material.external_url;
  if (!material.storage_path) throw new Error('This material does not have a file or link.');
  // New files live on files.learnwithmanabi.com. UUID-prefixed paths are legacy
  // objects that still need a Supabase signed URL.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(material.storage_path)) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.access_token) throw new Error('Sign in again before opening a material.');

    const params = new URLSearchParams({ id: material.id });
    if (download) params.set('download', '1');
    const response = await fetch(`${materialFilesUrl}/api/download.php?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error || 'Unable to open this material.');
    }
    return URL.createObjectURL(await response.blob());
  }
  const { data, error } = await supabase.storage.from('materials').createSignedUrl(
    material.storage_path,
    60,
    download && material.file_name ? { download: material.file_name } : undefined,
  );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Unable to open this material.');
  return data.signedUrl;
}
