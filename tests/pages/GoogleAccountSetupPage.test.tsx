import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import GoogleAccountSetupPage from '../../src/pages/GoogleAccountSetupPage';

const mocks = vi.hoisted(() => ({
  completeGooglePasswordSetup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'student@gmail.com',
      user_metadata: { name: 'Google Student' },
    },
    profile: {
      name: 'Google Student',
      student_id: null,
    },
    completeGooglePasswordSetup: mocks.completeGooglePasswordSetup,
    signOut: mocks.signOut,
  }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completeGooglePasswordSetup.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
});

it('requires profile details and creates a Manabi password for the Google account', async () => {
  render(<GoogleAccountSetupPage />);

  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@gmail.com');
  fireEvent.change(screen.getByLabelText('Student ID (optional)'), { target: { value: 'S-100' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'manabi-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'manabi-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  await waitFor(() => expect(mocks.completeGooglePasswordSetup).toHaveBeenCalledWith({
    password: 'manabi-secret',
    name: 'Google Student',
    studentId: 'S-100',
  }));
});

it('does not submit when the passwords do not match', async () => {
  render(<GoogleAccountSetupPage />);

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'manabi-secret' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  expect((await screen.findByRole('alert')).textContent).toContain('The passwords do not match.');
  expect(mocks.completeGooglePasswordSetup).not.toHaveBeenCalled();
});
