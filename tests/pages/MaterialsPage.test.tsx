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
  const largeMaterial: Material = {
    ...material,
    id: 'material-2',
    title: 'Large reference',
    file_name: 'reference.pdf',
    file_size: 2 * 1024 * 1024,
  };
  vi.mocked(listMaterials).mockResolvedValueOnce([material, largeMaterial]);

  render(
    <LanguageProvider>
      <MaterialsPage currentPage="materials" onNavigate={vi.fn()} />
    </LanguageProvider>,
  );

  fireEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);

  const dialog = screen.getByRole('dialog', { name: 'Delete material?' });
  const backdrop = dialog.parentElement!;
  expect(backdrop.parentElement).toBe(document.body);
  expect(backdrop.className).toContain('bg-slate-950/30');

  fireEvent.mouseDown(dialog);
  expect(screen.getByRole('dialog', { name: 'Delete material?' })).toBeTruthy();

  fireEvent.mouseDown(backdrop);
  expect(screen.queryByRole('dialog', { name: 'Delete material?' })).toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  const reopenedDialog = screen.getByRole('dialog');
  const dialogButtons = Array.from(reopenedDialog.querySelectorAll<HTMLButtonElement>('button'));
  const firstButton = dialogButtons[0];
  const lastButton = dialogButtons[dialogButtons.length - 1];

  firstButton.focus();
  fireEvent.keyDown(reopenedDialog, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(lastButton);

  fireEvent.keyDown(reopenedDialog, { key: 'Tab' });
  expect(document.activeElement).toBe(firstButton);

  fireEvent.keyDown(reopenedDialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Delete material?' })).toBeNull();
});
