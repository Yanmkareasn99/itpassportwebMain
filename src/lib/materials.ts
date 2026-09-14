import { isSupabaseEnabled, supabase } from './supabase';

export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;
export const MATERIAL_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'video/mp4',
] as const;

export interface Material {
  id: string;
  uploader_id: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

function requireSharedStorage() {
  if (!isSupabaseEnabled) throw new Error('Shared materials require Supabase to be enabled.');
}

export type MaterialFileProblem = 'invalidType' | 'emptyFile' | 'fileTooLarge';

const fileProblemMessages: Record<MaterialFileProblem, string> = {
  invalidType: 'Choose a PDF, PNG, JPEG, WebP, plain text, or MP4 file.',
  emptyFile: 'Choose a file that is not empty.',
  fileTooLarge: 'Files must be 20 MB or smaller.',
};

export function validateMaterialFile(file: File): MaterialFileProblem | null {
  if (!MATERIAL_MIME_TYPES.includes(file.type as typeof MATERIAL_MIME_TYPES[number])) {
    return 'invalidType';
  }
  if (file.size === 0) return 'emptyFile';
  if (file.size > MATERIAL_MAX_BYTES) return 'fileTooLarge';
  return null;
}

export async function listMaterials(): Promise<Material[]> {
  requireSharedStorage();
  const { data, error } = await supabase.from('materials').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Material[];
}

export async function uploadMaterial(userId: string, file: File, title: string, description: string): Promise<void> {
  requireSharedStorage();
  const problem = validateMaterialFile(file);
  if (problem) throw new Error(fileProblemMessages[problem]);
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error('Enter a title of up to 120 characters.');
  if (cleanDescription.length > 500) throw new Error('Description must be 500 characters or shorter.');

  const id = crypto.randomUUID();
  const path = `${userId}/${id}`;
  const bucket = supabase.storage.from('materials');
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error: recordError } = await supabase.from('materials').insert({
    id,
    uploader_id: userId,
    title: cleanTitle,
    description: cleanDescription || null,
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    storage_path: path,
  });
  if (recordError) {
    await bucket.remove([path]);
    throw recordError;
  }
}

export async function materialUrl(material: Material, download = false): Promise<string> {
  requireSharedStorage();
  const { data, error } = await supabase.storage.from('materials').createSignedUrl(
    material.storage_path,
    60,
    download ? { download: material.file_name } : undefined,
  );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Unable to open this material.');
  return data.signedUrl;
}
