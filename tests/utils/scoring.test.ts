import { describe, expect, it } from 'vitest';
import { calculateAccuracy, calculateScore, classifyAccuracy } from '../../src/lib/scoring';

describe('scoring utilities', () => {
  it('calculates rounded accuracy', () => {
    expect(calculateAccuracy(10, 10)).toBe(100);
    expect(calculateAccuracy(1, 3)).toBe(33);
    expect(calculateAccuracy(2, 3)).toBe(67);
  });

  it('returns zero accuracy when no questions were answered', () => {
    expect(calculateAccuracy(5, 0)).toBe(0);
  });

  it('calculates point scores', () => {
    expect(calculateScore(10)).toBe(10);
    expect(calculateScore(10, 5)).toBe(50);
  });

  it('classifies accuracy bands', () => {
    expect(classifyAccuracy(70)).toBe('good');
    expect(classifyAccuracy(50)).toBe('passable');
    expect(classifyAccuracy(49)).toBe('needs-improvement');
  });
});
