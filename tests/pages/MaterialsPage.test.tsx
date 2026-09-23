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
    deleteMaterial: vi.fn(),
  };
});

import { LanguageProvider } from '../../src/contexts/LanguageContext';
import MaterialsPage from '../../src/pages/MaterialsPage';

it('shows the material upload form only after opening its dropdown', async () => {
  localStorage.setItem('manabi_language', 'en');
  render(
    <LanguageProvider>
      <MaterialsPage currentPage="materials" onNavigate={vi.fn()} />
    </LanguageProvider>,
  );

  await screen.findByText('No materials have been uploaded yet.');

  const toggle = screen.getByRole('button', { name: 'Upload material' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Title')).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByLabelText('Title')).toBeTruthy();
  expect(screen.getByLabelText('File')).toBeTruthy();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByLabelText('Title')).toBeNull();
});
