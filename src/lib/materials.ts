import { isSupabaseEnabled, supabase } from './supabase';
import { StudyMaterial } from '../types';

const MATERIALS_BUCKET = 'study-materials';
const LOCAL_MATERIALS_KEY = 'manabi-local-materials';
const LOCAL_FILE_PREFIX = 'local-file:';

type StoredLocalMaterial = StudyMaterial & {
  data_url: string;
};

function readLocalMaterials(): StoredLocalMaterial[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MATERIALS_KEY) ?? '[]') as StoredLocalMaterial[];
  } catch {
    localStorage.removeItem(LOCAL_MATERIALS_KEY);
    return [];
  }
}

function writeLocalMaterials(materials: StoredLocalMaterial[]) {
  localStorage.setItem(LOCAL_MATERIALS_KEY, JSON.stringify(materials));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function makeSafeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'material';
}

export async function fetchStudyMaterials(): Promise<StudyMaterial[]> {
  if (!isSupabaseEnabled) {
    return readLocalMaterials().map(material => {
      const { data_url, ...studyMaterial } = material;
      void data_url;
      return studyMaterial;
    });
  }

  const { data, error } = await supabase
    .from('study_materials')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as StudyMaterial[];
}

export async function uploadStudyMaterial(params: {
  file: File;
  title: string;
  description: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const cleanName = makeSafeFileName(params.file.name);
  const title = params.title.trim() || params.file.name;

  if (!isSupabaseEnabled) {
    const id = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`;
    const material: StoredLocalMaterial = {
      id,
      title,
      description: params.description.trim() || null,
      file_name: params.file.name,
      file_path: `${LOCAL_FILE_PREFIX}${id}`,
      file_size: params.file.size,
      mime_type: params.file.type || 'application/octet-stream',
      uploaded_by: params.userId,
      created_at: now,
      updated_at: now,
      data_url: await fileToDataUrl(params.file),
    };
    writeLocalMaterials([material, ...readLocalMaterials()]);
    return material;
  }

  const filePath = `${params.userId}/${Date.now()}-${cleanName}`;
  const { error: uploadError } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .upload(filePath, params.file, {
      contentType: params.file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('study_materials')
    .insert({
      title,
      description: params.description.trim() || null,
      file_name: params.file.name,
      file_path: filePath,
      file_size: params.file.size,
      mime_type: params.file.type || 'application/octet-stream',
      uploaded_by: params.userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as StudyMaterial;
}

export async function getStudyMaterialUrl(material: StudyMaterial, download: boolean) {
  if (!isSupabaseEnabled) {
    const local = readLocalMaterials().find(item => item.id === material.id);
    if (!local) throw new Error('File not found.');
    return local.data_url;
  }

  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(material.file_path, 60, {
      download: download ? material.file_name : false,
    });

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStudyMaterial(material: StudyMaterial) {
  if (!isSupabaseEnabled) {
    writeLocalMaterials(readLocalMaterials().filter(item => item.id !== material.id));
    return;
  }

  const { error: storageError } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .remove([material.file_path]);
  if (storageError) throw storageError;

  const { error } = await supabase
    .from('study_materials')
    .delete()
    .eq('id', material.id);
  if (error) throw error;
}
