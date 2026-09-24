import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from '../../src/pages/LoginPage';
import { LoginRoute } from '../../src/App';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  clearPasswordRecovery: vi.fn(),
  abandonPasswordRecovery: vi.fn(),
  passwordRecoveryState: 'idle' as 'idle' | 'pending' | 'valid' | 'invalid',
  user: null as { id: string } | null,
  loading: false,
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mocks,
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.removeItem('manabi-theme');
  document.documentElement.classList.remove('dark');
  mocks.signUp.mockResolvedValue(false);
  mocks.resetPassword.mockResolvedValue(undefined);
  mocks.updatePassword.mockResolvedValue(undefined);
  mocks.abandonPasswordRecovery.mockResolvedValue(undefined);
  mocks.passwordRecoveryState = 'idle';
  mocks.user = null;
});

it.each([null, 'light'])('keeps light mode after leaving login with saved theme %s', savedTheme => {
  if (savedTheme) window.localStorage.setItem('manabi-theme', savedTheme);
  document.documentElement.classList.add('dark');
  const { unmount } = render(<MemoryRouter><LoginPage /></MemoryRouter>);

  expect(document.documentElement.classList.contains('dark')).toBe(false);
  unmount();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});

it('restores an explicitly saved dark theme after leaving login', () => {
  window.localStorage.setItem('manabi-theme', 'dark');
  const { unmount } = render(<MemoryRouter><LoginPage /></MemoryRouter>);

  unmount();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});

it('requests a password reset email from the login form', async () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith('student@example.com'));
  expect(screen.getByText(/password reset link has been sent/i)).toBeTruthy();
});

it('updates the password only after a valid recovery event', async () => {
  mocks.passwordRecoveryState = 'valid';
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

  await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith('new-secret'));
  expect(mocks.clearPasswordRecovery).toHaveBeenCalledTimes(1);
});

it('signs out the recovery session before returning to sign in', async () => {
  mocks.passwordRecoveryState = 'valid';
  render(
    <MemoryRouter initialEntries={['/login?recovery=1#type=recovery']}>
      <Routes>
        <Route path="/login" element={<><LoginPage /><LocationPath /></>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Back to sign in' }));

  await waitFor(() => expect(mocks.abandonPasswordRecovery).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('/login')).toBeTruthy();
  expect(mocks.updatePassword).not.toHaveBeenCalled();
  expect(mocks.clearPasswordRecovery).not.toHaveBeenCalled();
});

it('does not trust a recovery query parameter by itself', () => {
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);
  expect(screen.queryByLabelText('New password')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(mocks.updatePassword).not.toHaveBeenCalled();
});

it('shows an invalid-link error and returns to sign-in', async () => {
  mocks.passwordRecoveryState = 'invalid';
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);
  expect(await screen.findByText(/invalid, expired, or has already been used/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(screen.queryByLabelText('New password')).toBeNull();
});

it('rejects a password shorter than the minimum', async () => {
  mocks.passwordRecoveryState = 'valid';
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Update password' }).closest('form')!);
  expect(await screen.findByText(/at least 6 characters/i)).toBeTruthy();
  expect(mocks.updatePassword).not.toHaveBeenCalled();
});

it('rejects a password confirmation mismatch', async () => {
  mocks.passwordRecoveryState = 'valid';
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByText(/passwords do not match/i)).toBeTruthy();
  expect(mocks.updatePassword).not.toHaveBeenCalled();
});

it('shows a red already-registered error instead of a confirmation notice', async () => {
  mocks.signUp.mockRejectedValueOnce(new Error('User already registered'));
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'No account? Create one' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Student' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'registered@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  const message = await screen.findByText('This email is already registered.');
  expect(message.closest('div')?.className).toContain('text-red-600');
  expect(screen.queryByText(/confirmation email sent/i)).toBeNull();
});

it('shows a localized error when updating the password fails', async () => {
  mocks.passwordRecoveryState = 'valid';
  mocks.updatePassword.mockRejectedValueOnce(new Error('expired token'));
  render(<MemoryRouter initialEntries={['/login?recovery=1']}><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByText(/unable to update your password/i)).toBeTruthy();
});

function LocationPath() {
  const location = useLocation();
  return <span>{location.pathname}{location.search}{location.hash}</span>;
}

it('cleans the recovery URL and redirects after a successful update', async () => {
  mocks.passwordRecoveryState = 'valid';
  render(
    <MemoryRouter initialEntries={['/login?recovery=1#type=recovery']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<LocationPath />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByText('/')).toBeTruthy();
});

it('redirects a normal signed-in user away from a recovery URL', async () => {
  mocks.user = { id: 'normal-user' };
  render(
    <MemoryRouter initialEntries={['/login?recovery=1']}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<span>Home route</span>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText('Home route')).toBeTruthy();
  expect(screen.queryByLabelText('New password')).toBeNull();
});
