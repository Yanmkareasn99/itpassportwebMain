export const PRACTICE_PROGRESS_CHANGED_EVENT = 'manabi:practice-progress-changed';
export const PRACTICE_PROGRESS_CHANGED_STORAGE_KEY = 'manabi-practice-progress-updated';

/** Notifies the current page and other open tabs that study activity changed. */
export function notifyPracticeProgressChanged() {
  window.dispatchEvent(new Event(PRACTICE_PROGRESS_CHANGED_EVENT));
  try {
    window.localStorage.setItem(
      PRACTICE_PROGRESS_CHANGED_STORAGE_KEY,
      `${Date.now()}:${Math.random()}`,
    );
  } catch {
    // The same-page event still works when storage is unavailable.
  }
}
