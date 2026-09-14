import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  signedUrl: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signedUrl }) },
    from: () => ({
      insert: mocks.insert,
      select: () => ({ order: mocks.order }),
    }),
  },
}));

import { MATERIAL_MAX_BYTES, listMaterials, materialUrl, uploadMaterial, validateMaterialFile, type Material } from '../../src/lib/materials';

const pdf = () => new File(['%PDF-1.7'], 'guide.pdf', { type: 'application/pdf' });

describe('shared materials', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => '0f869a7d-c645-49d8-8204-41382b6f0c91' });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.signedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.test/guide' }, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects unsupported, empty, and oversized files', () => {
    expect(validateMaterialFile(new File(['<html>'], 'page.html', { type: 'text/html' }))).toBeTruthy();
    expect(validateMaterialFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toBeTruthy();
    expect(validateMaterialFile({ type: 'application/pdf', size: MATERIAL_MAX_BYTES + 1 } as File)).toBeTruthy();
    expect(validateMaterialFile(pdf())).toBeNull();
  });

  it('uploads the file and publishes its metadata under the user folder', async () => {
    await uploadMaterial('user-1', pdf(), ' Guide ', ' For beginners ');
    expect(mocks.upload).toHaveBeenCalledWith('user-1/0f869a7d-c645-49d8-8204-41382b6f0c91', expect.any(File), {
      contentType: 'application/pdf', upsert: false,
    });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Guide', description: 'For beginners', uploader_id: 'user-1', file_name: 'guide.pdf',
    }));
  });

  it('removes an uploaded file if publishing its metadata fails', async () => {
    mocks.insert.mockResolvedValueOnce({ error: new Error('database unavailable') });
    await expect(uploadMaterial('user-1', pdf(), 'Guide', '')).rejects.toThrow('database unavailable');
    expect(mocks.remove).toHaveBeenCalledWith(['user-1/0f869a7d-c645-49d8-8204-41382b6f0c91']);
  });

  it('lists shared records and signs a download with its original name', async () => {
    const material = { storage_path: 'user-1/file-id', file_name: 'guide.pdf' } as Material;
    mocks.order.mockResolvedValueOnce({ data: [material], error: null });
    expect(await listMaterials()).toEqual([material]);
    expect(await materialUrl(material, true)).toBe('https://example.test/guide');
    expect(mocks.signedUrl).toHaveBeenCalledWith('user-1/file-id', 60, { download: 'guide.pdf' });
  });
});
