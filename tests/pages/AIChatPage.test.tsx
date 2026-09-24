import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIChatPage from '../../src/pages/AIChatPage';
import { supabase } from '../../src/lib/supabase';

const mocks = vi.hoisted(() => ({
  profile: { id: 'profile-1', name: 'Student' } as { id: string; name: string } | null,
  getChatReply: vi.fn(),
}));

vi.mock('../../src/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: mocks.profile }),
}));

vi.mock('../../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/lib/aiChat', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/aiChat')>();
  return { ...original, getChatReply: mocks.getChatReply };
});

type QueryResult = { data?: unknown; error?: unknown };
type Query = Record<string, ReturnType<typeof vi.fn>> & {
  then?: PromiseLike<QueryResult>['then'];
};

const fromMock = vi.mocked(supabase.from);
let tableResults: Record<string, QueryResult>;
let queries: Array<{ table: string; query: Query }>;

function createQuery(table: string) {
  const query: Query = {};
  for (const method of ['select', 'order', 'limit', 'eq', 'insert', 'delete']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(tableResults[table] ?? { data: null, error: null })
    .then(resolve, reject);
  queries.push({ table, query });
  return query;
}

describe('AIChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = { id: 'profile-1', name: 'Student' };
    mocks.getChatReply.mockResolvedValue('Here is the explanation.');
    tableResults = {
      subjects: { data: [{ id: 'subject-1', name: 'Strategy' }], error: null },
      questions: { data: [{ id: 'question-1', subject_id: 'subject-1', question_text: 'Question' }], error: null },
      ai_chat_messages: { data: [], error: null },
    };
    queries = [];
    fromMock.mockImplementation(table => createQuery(String(table)) as never);
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('loads subjects, recent questions and persisted messages', async () => {
    tableResults.ai_chat_messages = {
      data: [
        { role: 'user', content: 'My saved question', created_at: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'My saved answer', created_at: '2026-01-01T00:00:01Z' },
      ],
      error: null,
    };

    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);

    expect(await screen.findByText('My saved question')).toBeTruthy();
    expect(screen.getByText('My saved answer')).toBeTruthy();
    expect(fromMock).toHaveBeenCalledWith('subjects');
    expect(fromMock).toHaveBeenCalledWith('questions');
    expect(fromMock).toHaveBeenCalledWith('ai_chat_messages');
  });

  it('sends and persists user and assistant messages', async () => {
    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('questions'));

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Explain encryption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Explain encryption')).toBeTruthy();
    expect(await screen.findByText('Here is the explanation.')).toBeTruthy();
    expect(mocks.getChatReply).toHaveBeenCalledWith(
      'Explain encryption',
      expect.objectContaining({
        language: 'en',
        profileName: 'Student',
        subject: expect.objectContaining({ id: 'subject-1' }),
        recentQuestions: expect.arrayContaining([expect.objectContaining({ id: 'question-1' })]),
      }),
    );

    const inserts = queries
      .filter(item => item.table === 'ai_chat_messages')
      .flatMap(item => item.query.insert.mock.calls.map(call => call[0]));
    expect(inserts).toEqual(expect.arrayContaining([
      { user_id: 'profile-1', role: 'user', content: 'Explain encryption' },
      { user_id: 'profile-1', role: 'assistant', content: 'Here is the explanation.' },
    ]));
  });

  it('submits with Ctrl+Enter and starter prompts', async () => {
    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Keyboard question' } });
    fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(mocks.getChatReply).toHaveBeenCalledWith(
      'Keyboard question',
      expect.any(Object),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Create a study plan for today' }));
    await waitFor(() => expect(mocks.getChatReply).toHaveBeenCalledWith(
      'Create a study plan for today',
      expect.any(Object),
    ));
  });

  it('does not persist guest messages', async () => {
    mocks.profile = null;
    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Guest question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Here is the explanation.')).toBeTruthy();
    expect(mocks.getChatReply).toHaveBeenCalledWith(
      'Guest question',
      expect.objectContaining({ profileName: 'you' }),
    );
    expect(queries.some(item => item.query.insert.mock.calls.length > 0)).toBe(false);
  });

  it('clears persisted history and restores the welcome message', async () => {
    tableResults.ai_chat_messages = {
      data: [{ role: 'user', content: 'Old message', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    };
    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);
    expect(await screen.findByText('Old message')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(screen.queryByText('Old message')).toBeNull());
    expect(screen.getByText(/Ask me about solving questions/)).toBeTruthy();
    const deletion = queries.find(item => item.query.delete.mock.calls.length > 0)?.query;
    expect(deletion?.eq).toHaveBeenCalledWith('user_id', 'profile-1');
  });

  it('reports persistence and reset failures without breaking the chat', async () => {
    fromMock.mockImplementation(table => {
      const query = createQuery(String(table));
      if (table === 'ai_chat_messages') {
        query.insert.mockImplementation(() => {
          throw new Error('insert failed');
        });
        query.delete.mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ error: { message: 'delete failed' } }),
        }));
      }
      return query as never;
    });

    render(<AIChatPage currentPage="ai-chat" onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Still answer me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Here is the explanation.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
  });
});
