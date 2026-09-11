import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../../src/pages/LoginPage';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mocks,
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signUp.mockResolvedValue(false);
  mocks.resetPassword.mockResolvedValue(undefined);
  mocks.updatePassword.mockResolvedValue(undefined);
});

it('requests a password reset email from the login form', async () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith('student@example.com'));
  expect(screen.getByText(/password reset link has been sent/i)).toBeTruthy();
});

it('updates the password when opened from a recovery link', async () => {
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

  await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith('new-secret'));
});
