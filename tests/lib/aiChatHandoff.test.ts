import { beforeEach, describe, expect, it } from 'vitest';
import { queueAiChatHandoff, takeAiChatHandoff } from '../../src/lib/aiChatHandoff';

describe('AI chat handoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('transfers the practice question and explanation exactly once', () => {
    queueAiChatHandoff('Question context', 'Direct explanation');

    expect(takeAiChatHandoff()?.turns).toEqual([
      { role: 'user', content: 'Question context' },
      { role: 'assistant', content: 'Direct explanation' },
    ]);
    expect(takeAiChatHandoff()).toBeNull();
  });

  it('discards malformed handoff data', () => {
    window.sessionStorage.setItem('manabi-ai-chat-handoff', '{not-json');

    expect(takeAiChatHandoff()).toBeNull();
  });
});
