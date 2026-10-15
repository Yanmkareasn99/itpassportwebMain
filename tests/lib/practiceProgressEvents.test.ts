import { describe, expect, it, vi } from 'vitest';
import {
  notifyPracticeProgressChanged,
  PRACTICE_PROGRESS_CHANGED_EVENT,
  PRACTICE_PROGRESS_CHANGED_STORAGE_KEY,
} from '../../src/lib/practiceProgressEvents';

describe('practice progress events', () => {
  it('notifies the current page and records a marker for other tabs', () => {
    const listener = vi.fn();
    window.addEventListener(PRACTICE_PROGRESS_CHANGED_EVENT, listener);

    notifyPracticeProgressChanged();

    expect(listener).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PRACTICE_PROGRESS_CHANGED_STORAGE_KEY)).toBeTruthy();
    window.removeEventListener(PRACTICE_PROGRESS_CHANGED_EVENT, listener);
  });
});
