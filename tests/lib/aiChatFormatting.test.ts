import { describe, expect, it } from 'vitest';
import { formatAiChatContent } from '../../src/lib/aiChatFormatting';

describe('formatAiChatContent', () => {
  it('removes inline math delimiters and converts common logic commands', () => {
    expect(formatAiChatContent(
      'Truth table: $A \\land B \\rightarrow Y$, $A \\lor B$, and $\\neg A$.',
    )).toBe('Truth table: A ∧ B → Y, A ∨ B, and ¬ A.');
  });

  it('handles yen-rendered commands and LaTeX text wrappers', () => {
    expect(formatAiChatContent(
      '0 and 1 ¥rightarrow ¥mathbf{1}; A ¥oplus B ¥neq 0',
    )).toBe('0 and 1 → 1; A ⊕ B ≠ 0');
  });

  it('does not remove an unmatched currency dollar sign', () => {
    expect(formatAiChatContent('The book costs $5.')).toBe('The book costs $5.');
  });
});
