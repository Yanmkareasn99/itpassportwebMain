import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../../src/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  refreshProfile: vi.fn(),
  deleteAccount: vi.fn(),
  setLanguage: vi.fn(),
  setRandomize: vi.fn(),
  randomize: false,
  user: { id: 'user-1', email: 'student@example.com' } as { id: string; email: string } | null,
  profile: {
    id: 'user-1',
    name: 'Student',
    student_id: 'S-1',
    class_name: 'Class A',
    avatar_url: null,
  } as Record<string, unknown> | null,
}));

vi.mock('../../src/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    profile: mocks.profile,
    refreshProfile: mocks.refreshProfile,
    deleteAccount: mocks.deleteAccount,
  }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: mocks.setLanguage }),
}));

vi.mock('../../src/lib/questionRandomization', () => ({
  getRandomizeAnswerChoicesPreference: () => mocks.randomize,
  setRandomizeAnswerChoicesPreference: mocks.setRandomize,
}));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: mocks.from,
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
    },
  },
}));

type QueryResult = { data?: unknown; error?: { message: string } | null };
type Query = Record<string, ReturnType<typeof vi.fn>> & {
  then?: PromiseLike<QueryResult>['then'];
};

let tableResults: Record<string, QueryResult>;
let queries: Array<{ table: string; query: Query }>;

function createQuery(table: string) {
  const query: Query = {};
  for (const method of ['select', 'update', 'upsert', 'eq', 'maybeSingle']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(tableResults[table] ?? { data: null, error: null })
    .then(resolve, reject);
  queries.push({ table, query });
  return query;
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    mocks.randomize = false;
    mocks.user = { id: 'user-1', email: 'student@example.com' };
    mocks.profile = {
      id: 'user-1',
      name: 'Student',
      student_id: 'S-1',
      class_name: 'Class A',
      avatar_url: null,
    };
    mocks.refreshProfile.mockResolvedValue(undefined);
    mocks.deleteAccount.mockResolvedValue(undefined);
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    tableResults = { exam_targets: { data: null, error: null } };
    queries = [];
    mocks.from.mockImplementation(table => createQuery(String(table)) as never);
  });

  it('updates theme, randomization and language preferences', async () => {
    render(<SettingsPage currentPage="settings" onNavigate={vi.fn()} />);
    const switches = screen.getAllByRole('switch');

    fireEvent.click(switches[0]);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('manabi-theme')).toBe('dark');

    fireEvent.click(switches[1]);
    expect(mocks.setRandomize).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: /Language/ }));
    fireEvent.click(screen.getByRole('button', { name: /日本語/ }));
    expect(mocks.setLanguage).toHaveBeenCalledWith('ja');
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('loads and saves an exam target', async () => {
    tableResults.exam_targets = {
      data: { target_date: '2027-01-10', exam_name: 'IT Passport' },
      error: null,
    };
    render(<SettingsPage currentPage="settings" onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('2027-01-10')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Target Exam Date/ }));

    const examName = screen.getByPlaceholderText('e.g. IT Passport Examination');
    const date = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(examName, { target: { value: 'Spring exam' } });
    fireEvent.change(date, { target: { value: '2027-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Target exam date saved')).toBeTruthy();
    const upsert = queries.find(item => item.query.upsert.mock.calls.length > 0)?.query.upsert;
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', target_date: '2027-04-01', exam_name: 'Spring exam' },
      { onConflict: 'user_id' },
    );
  });

  it('shows an error when saving an exam target fails', async () => {
    render(<SettingsPage currentPage="settings" onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Target Exam Date/ }));
    tableResults.exam_targets = { data: null, error: { message: 'offline' } };

    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, {
      target: { value: '2027-04-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save: offline')).toBeTruthy();
  });

  it('updates profile fields and avatar', async () => {
    render(<SettingsPage currentPage="profile" onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Taro Yamada'), { target: { value: ' Updated Student ' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 2024001'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. IT Year 2, Class A'), { target: { value: ' Class B ' } });
    fireEvent.click(screen.getByRole('button', { name: /avatar 2/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Profile saved')).toBeTruthy();
    const update = queries.find(item => item.table === 'profiles')?.query.update;
    expect(update).toHaveBeenCalledWith({
      name: 'Updated Student',
      student_id: null,
      class_name: 'Class B',
      avatar_url: '/avatars/avatar2.png',
    });
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('shows profile update failures', async () => {
    tableResults.profiles = { data: null, error: { message: 'permission denied' } };
    render(<SettingsPage currentPage="profile" onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save: permission denied')).toBeTruthy();
    expect(mocks.refreshProfile).not.toHaveBeenCalled();
  });

  it('validates and successfully changes a password', async () => {
    render(<SettingsPage currentPage="profile" onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    const current = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    const newPasswords = document.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]');

    fireEvent.change(current, { target: { value: 'old-password' } });
    fireEvent.change(newPasswords[0], { target: { value: 'new-password' } });
    fireEvent.change(newPasswords[1], { target: { value: 'different' } });
    fireEvent.submit(current.closest('form')!);
    expect(await screen.findByText('The new passwords do not match')).toBeTruthy();

    fireEvent.change(newPasswords[1], { target: { value: 'new-password' } });
    fireEvent.submit(current.closest('form')!);
    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'old-password',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('handles password verification and update failures', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: 'wrong password' } });
    render(<SettingsPage currentPage="profile" onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    const current = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    const newPasswords = document.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]');
    fireEvent.change(current, { target: { value: 'wrong' } });
    fireEvent.change(newPasswords[0], { target: { value: 'new-password' } });
    fireEvent.change(newPasswords[1], { target: { value: 'new-password' } });
    fireEvent.submit(current.closest('form')!);
    expect(await screen.findByText(/current password is incorrect/i)).toBeTruthy();

    mocks.signInWithPassword.mockResolvedValueOnce({ error: null });
    mocks.updateUser.mockResolvedValueOnce({ error: { message: 'expired session' } });
    fireEvent.submit(current.closest('form')!);
    expect(await screen.findByText('Failed to change password: expired session')).toBeTruthy();
  });

  it('validates and submits account deletion', async () => {
    render(<SettingsPage currentPage="profile" onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const confirmation = screen.getByPlaceholderText('student@example.com');
    const form = confirmation.closest('form')!;

    fireEvent.change(confirmation, { target: { value: 'wrong@example.com' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/does not match/i)).toBeTruthy();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();

    mocks.deleteAccount.mockRejectedValueOnce(new Error('server refused'));
    fireEvent.change(confirmation, { target: { value: 'STUDENT@example.com' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Failed to delete account: server refused')).toBeTruthy();
  });

  it('opens help answers and uses the correct back behavior', async () => {
    const onNavigate = vi.fn();
    render(<SettingsPage currentPage="settings" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    const practice = screen.getByRole('button', { name: 'Practice' });
    fireEvent.click(practice);
    expect(screen.getByText(/Pick a topic in Practice/)).toBeTruthy();
    fireEvent.click(practice);
    expect(screen.queryByText(/Pick a topic in Practice/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
