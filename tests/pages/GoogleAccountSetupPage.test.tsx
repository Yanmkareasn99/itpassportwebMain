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
      class_name: null,
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
  fireEvent.change(screen.getByLabelText('Student ID (optional)'), { target: { value: 'S-100' } });
  fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'IT Year 2, Class A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  await waitFor(() => expect(mocks.completeGoogleAccountSetup).toHaveBeenCalledWith({
    name: 'Google Student',
    studentId: 'S-100',
    className: 'IT Year 2, Class A',
  }));
});

it('does not submit when the required class is missing', async () => {
  render(<GoogleAccountSetupPage />);

  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  expect((screen.getByLabelText('Class') as HTMLInputElement).checkValidity()).toBe(false);
  expect(mocks.completeGoogleAccountSetup).not.toHaveBeenCalled();
});
