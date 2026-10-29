import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import GoogleAccountSetupPage from '../../src/pages/GoogleAccountSetupPage';

const mocks = vi.hoisted(() => ({
  completeGoogleAccountSetup: vi.fn(),
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
    completeGoogleAccountSetup: mocks.completeGoogleAccountSetup,
    signOut: mocks.signOut,
  }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completeGoogleAccountSetup.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
});

it('requires profile details without asking for a password', async () => {
  render(<GoogleAccountSetupPage />);

  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('student@gmail.com');
  expect(screen.queryByLabelText('New password')).toBeNull();
  expect(screen.queryByLabelText('Class')).toBeNull();
  fireEvent.change(screen.getByLabelText('Student ID (optional)'), { target: { value: 'S-100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  await waitFor(() => expect(mocks.completeGoogleAccountSetup).toHaveBeenCalledWith({
    name: 'Google Student',
    studentId: 'S-100',
  }));
});

it('does not submit when the required username is missing', async () => {
  render(<GoogleAccountSetupPage />);

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Please enter your name.');
  expect(mocks.completeGoogleAccountSetup).not.toHaveBeenCalled();
});
