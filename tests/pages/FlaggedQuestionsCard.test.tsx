import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FlaggedQuestionsCard } from '../../src/pages/PracticeListPage';

it('reveals flag counts and starts all or one flag category on request', () => {
  const onStart = vi.fn();
  render(<FlaggedQuestionsCard
    counts={{ green: 2, orange: 1, red: 0 }}
    onStart={onStart}
    loading={false}
    language="en"
  />);

  expect(screen.getByText('3 flagged questions')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Practice all flagged questions/ })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Flagged questions/ }));
  expect(screen.getByRole('button', { name: 'Green flag: 2' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Yellow flag: 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Red flag: 0' })).toHaveProperty('disabled', true);

  fireEvent.click(screen.getByRole('button', { name: 'Yellow flag: 1' }));
  expect(screen.queryByRole('button', { name: /Practice all flagged questions/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Flagged questions/ }));
  fireEvent.click(screen.getByRole('button', { name: /Practice all flagged questions/ }));
  expect(onStart.mock.calls).toEqual([['orange'], []]);

  fireEvent.click(screen.getByRole('button', { name: /Flagged questions/ }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('button', { name: /Practice all flagged questions/ })).toBeNull();
});
