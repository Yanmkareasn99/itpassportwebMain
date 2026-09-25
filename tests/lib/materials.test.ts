import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  order: vi.fn(),
  getSession: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    auth: { getSession: mocks.getSession },
    storage: { from: () => ({ createSignedUrl: mocks.signedUrl }) },
    from: () => ({
      select: () => ({ order: mocks.order }),
      insert: mocks.insert,
      delete: mocks.remove,
    }),
  },
}));

import { deleteMaterial, MATERIAL_MAX_BYTES, listMaterials, materialUrl, shareMaterialLink, uploadMaterial, validateMaterialFile, validateMaterialLink, type Material } from '../../src/lib/materials';

const pdf = () => new File(['%PDF-1.7'], 'guide.pdf', { type: 'application/pdf' });

describe('shared materials', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'access-token', user: { id: 'user-id' } } }, error: null });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.remove.mockReturnValue({ eq: mocks.eq });
    mocks.signedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.test/guide' }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ material: {} }) }));
    class TestUrl extends URL {
      static createObjectURL = vi.fn(() => 'blob:material-file');
    }
    vi.stubGlobal('URL', TestUrl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects unsupported, empty, and oversized files', () => {
    expect(validateMaterialFile(new File(['<html>'], 'page.html', { type: 'text/html' }))).toBeTruthy();
    expect(validateMaterialFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toBeTruthy();
    expect(validateMaterialFile({ name: 'large.pdf', type: 'application/pdf', size: MATERIAL_MAX_BYTES + 1 } as File)).toBeTruthy();
    expect(validateMaterialFile(pdf())).toBeNull();
    expect(validateMaterialFile(new File(['doc'], 'lesson.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }))).toBeNull();
    expect(validateMaterialFile(new File(['zip'], 'lesson.docx', { type: 'application/zip' }))).toBeNull();
    expect(validateMaterialFile(new File(['zip'], 'lesson.zip', { type: 'application/zip' }))).toBeTruthy();
  });

  it('uploads the file to the material server with the user access token', async () => {
    const file = pdf();
    await uploadMaterial(file, ' Guide ', ' For beginners ');

    expect(fetch).toHaveBeenCalledWith('https://files.learnwithmanabi.com/api/upload.php', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
      body: expect.any(FormData),
    }));
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('title')).toBe('Guide');
    expect(body.get('description')).toBe('For beginners');
  });

  it('shows an error returned by the material server', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Only material managers can upload files.' }),
    } as Response);
    await expect(uploadMaterial(pdf(), 'Guide', '')).rejects.toThrow('Only material managers can upload files.');
  });

  it('validates and shares HTTPS material links directly through Supabase', async () => {
    expect(validateMaterialLink('not a link')).toBe('invalidLink');
    expect(validateMaterialLink('http://example.com/file')).toBe('insecureLink');
    expect(validateMaterialLink('https://drive.google.com/file/d/123')).toBeNull();

    await shareMaterialLink(' https://drive.google.com/file/d/123 ', ' Drive guide ', ' Backup copy ');

    expect(mocks.insert).toHaveBeenCalledWith({
      uploader_id: 'user-id',
      title: 'Drive guide',
      description: 'Backup copy',
      external_url: 'https://drive.google.com/file/d/123',
    });
  });

  it('opens and deletes external links without calling the file server', async () => {
    const material = {
      id: 'link-id',
      external_url: 'https://drive.google.com/file/d/123',
      storage_path: null,
    } as Material;

    expect(await materialUrl(material)).toBe(material.external_url);
    await deleteMaterial(material);

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith('id', 'link-id');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists shared records and signs a download with its original name', async () => {
    const material = {
      storage_path: '0f869a7d-c645-49d8-8204-41382b6f0c91/860f290e-9530-449d-b18f-fbb78f6a2134',
      file_name: 'guide.pdf',
    } as Material;
    mocks.order.mockResolvedValueOnce({ data: [material], error: null });
    expect(await listMaterials()).toEqual([material]);
    expect(await materialUrl(material, true)).toBe('https://example.test/guide');
    expect(mocks.signedUrl).toHaveBeenCalledWith(material.storage_path, 60, { download: 'guide.pdf' });
  });

  it('fetches files from the authenticated material download API', async () => {
    const fileBlob = new Blob(['file']);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, blob: async () => fileBlob } as Response);
    const material = { id: 'material-id', storage_path: '2026/09/file.png', file_name: 'guide.png' } as Material;

    expect(await materialUrl(material)).toBe('blob:material-file');
    expect(fetch).toHaveBeenCalledWith(
      'https://files.learnwithmanabi.com/api/download.php?id=material-id',
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(fileBlob);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it('deletes a material through the authenticated material server', async () => {
    await deleteMaterial('material-id');

    expect(fetch).toHaveBeenCalledWith(
      'https://files.learnwithmanabi.com/api/delete.php?id=material-id',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer access-token' },
      },
    );
  });

});
