import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../../src/components/Sidebar';
import { LanguageProvider } from '../../src/contexts/LanguageContext';

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

describe('Sidebar active state', () => {
  it('highlights Admin and Settings routes like the main navigation items', () => {
    localStorage.setItem('manabi_language', 'en');
    const onNavigate = vi.fn();
    const { rerender } = render(
      <LanguageProvider>
        <Sidebar currentPage="admin" onNavigate={onNavigate} />
      </LanguageProvider>,
    );

    expect(screen.getByRole('button', { name: 'Admin' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBeNull();

    rerender(
      <LanguageProvider>
        <Sidebar currentPage="profile" onNavigate={onNavigate} />
      </LanguageProvider>,
    );

    expect(screen.getByRole('button', { name: 'Admin' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });
});
