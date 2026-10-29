import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ActiveBattleRedirector } from '../../src/App';

const mocks = vi.hoisted(() => ({
  room: null as Record<string, unknown> | null,
  realtimeCallback: null as ((payload: { new: Record<string, unknown> }) => void) | null,
  removeChannel: vi.fn(),
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'creator-1' } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: true,
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: mocks.room, error: null }),
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: typeof mocks.realtimeCallback) => {
          mocks.realtimeCallback = callback;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: mocks.removeChannel,
  },
}));

function renderRedirector() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ActiveBattleRedirector />
      <Routes>
        <Route path="/" element={<span>Home route</span>} />
        <Route path="/battle" element={<span>Battle route</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.room = null;
  mocks.realtimeCallback = null;
});

it('redirects a creator who already has an active joined battle', async () => {
  mocks.room = {
    id: 'room-1',
    creator_id: 'creator-1',
    opponent_id: 'opponent-1',
    status: 'active',
  };

  renderRedirector();

  expect(await screen.findByText('Battle route')).toBeTruthy();
});

it('redirects the creator as soon as an opponent joins', async () => {
  renderRedirector();
  expect(await screen.findByText('Home route')).toBeTruthy();

  act(() => mocks.realtimeCallback?.({
    new: {
      id: 'room-1',
      creator_id: 'creator-1',
      opponent_id: 'opponent-1',
      status: 'active',
    },
  }));

  await waitFor(() => expect(screen.getByText('Battle route')).toBeTruthy());
});
