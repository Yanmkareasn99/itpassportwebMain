import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  authCallback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  },
}));

vi.mock('../../src/lib/points', () => ({
  claimDailyLoginPoints: vi.fn().mockResolvedValue({ balance: 0 }),
}));

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="recovery-state">{auth.passwordRecoveryState}</span>
      <button type="button" onClick={() => void auth.updatePassword('new-secret').catch(() => undefined)}>
        Update
      </button>
    </div>
  );
}

const recoverySession = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'recovering-user',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  },
} as Session;

describe('AuthProvider password recovery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/login?recovery=1');
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: recoverySession.user }, error: null });
    mocks.onAuthStateChange.mockImplementation((callback: typeof mocks.authCallback) => {
      mocks.authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  it('validates recovery only after Supabase emits PASSWORD_RECOVERY', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('recovery-state').textContent).toBe('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(mocks.updateUser).not.toHaveBeenCalled();

    act(() => mocks.authCallback?.('PASSWORD_RECOVERY', recoverySession));
    expect(await screen.findByText('valid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-secret' }));
    expect(await screen.findByText('idle')).toBeTruthy();
  });

  it('invalidates a recovery query when the normal initial session event arrives', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => mocks.authCallback?.('INITIAL_SESSION', null));
    expect(await screen.findByText('invalid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('immediately identifies an expired recovery callback', async () => {
    window.history.replaceState({}, '', '/login?error=access_denied&error_code=otp_expired');
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('recovery-state').textContent).toBe('invalid');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
