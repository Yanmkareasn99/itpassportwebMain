import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../src/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' }, isAdmin: true }),
}));

vi.mock('../../src/lib/materials', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/materials')>();
  return {
    ...original,
    listMaterials: vi.fn().mockResolvedValue([]),
    uploadMaterial: vi.fn(),
    shareMaterialLink: vi.fn(),
    deleteMaterial: vi.fn(),
  };
});

import { LanguageProvider } from '../../src/contexts/LanguageContext';
import { listMaterials, type Material } from '../../src/lib/materials';
import MaterialsPage from '../../src/pages/MaterialsPage';

it('shows the material upload form only after opening its dropdown', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(
    <LanguageProvider>
      <MaterialsPage currentPage="materials" onNavigate={vi.fn()} />
    </LanguageProvider>,
  );

  await screen.findByText('No materials have been uploaded yet.');

  const toggle = screen.getByRole('button', { name: 'Share material' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Title')).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByLabelText('Title')).toBeTruthy();
  expect(screen.getByLabelText('File')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
  expect(screen.queryByLabelText('File')).toBeNull();
  expect(screen.getByLabelText('HTTPS link')).toBeTruthy();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Title')).toBeNull();
});

it('renders the delete confirmation backdrop at the document root', async () => {
  localStorage.setItem('manabi_language', 'en');
  const material: Material = {
    id: 'material-1',
    uploader_id: 'admin-1',
    title: 'Study guide',
    description: null,
    file_name: 'guide.pdf',
    mime_type: 'application/pdf',
    file_size: 1024,
    storage_path: '2026/09/guide.pdf',
    external_url: null,
    created_at: '2026-09-25T00:00:00.000Z',
  };
  vi.mocked(listMaterials).mockResolvedValueOnce([material]);

  render(
    <LanguageProvider>
      <MaterialsPage currentPage="materials" onNavigate={vi.fn()} />
    </LanguageProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

  const dialog = screen.getByRole('dialog', { name: 'Delete material?' });
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(dialog.parentElement?.className).toContain('bg-slate-950/30');
});
