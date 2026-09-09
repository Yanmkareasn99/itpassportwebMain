import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from '../../src/contexts/LanguageContext';
import MockExamTab from '../../src/components/admin/tabs/MockExamTab';
import { ErrorMessage } from '../../src/components/ui/LoadingError';
import { en } from '../../src/i18n/locales/en';
import { ja } from '../../src/i18n/locales/ja';
import { vi as vietnamese } from '../../src/i18n/locales/vi';
import { translateMessage } from '../../src/i18n';

vi.mock('../../src/lib/mockExamSettings', () => ({
  DEFAULT_MOCK_EXAM_SETTINGS: { question_count: 8, duration_minutes: 90, passing_score_percent: 70 },
  fetchMockExamSettings: async () => ({ question_count: 8, duration_minutes: 90, passing_score_percent: 70 }),
  saveMockExamSettings: vi.fn(),
}));

function Switcher() {
  const { setLanguage } = useLanguage();
  return <><button onClick={() => setLanguage('ja')}>JA</button><button onClick={() => setLanguage('vi')}>VI</button></>;
}

beforeEach(() => { localStorage.setItem('manabi_language', 'en'); });

it('updates settings labels and existing errors while preserving edited values', async () => {
  render(<LanguageProvider><Switcher /><MockExamTab /><ErrorMessage
    error={{ message: 'Unable to start practice.', code: 'TEST', timestamp: 0 }} onRetry={() => {}} />
  </LanguageProvider>);
  await waitFor(() => expect((screen.getByLabelText('Question count') as HTMLInputElement).closest('fieldset')?.disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Question count'), { target: { value: '17' } });
  fireEvent.click(screen.getByText('JA'));
  expect(screen.getByText('模擬試験の設定')).toBeTruthy();
  expect((screen.getByLabelText('問題数') as HTMLInputElement).value).toBe('17');
  expect(screen.getByText('練習を開始できませんでした。')).toBeTruthy();
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy();
  fireEvent.click(screen.getByText('VI'));
  expect(screen.getByText('Cài đặt thi thử')).toBeTruthy();
  expect((screen.getByLabelText('Số câu hỏi') as HTMLInputElement).value).toBe('17');
  expect(screen.getByText('Không bắt đầu được luyện tập.')).toBeTruthy();
});

it('translates parameterized errors while retaining values and unknown server diagnostics', () => {
  expect(translateMessage('ja', 'Question count must be a whole number between 1 and 1000.'))
    .toBe('問題数は1〜1000の整数で入力してください。');
  expect(translateMessage('vi', 'Time limit must be a whole number between 1 and 1440.'))
    .toBe('Thời gian phải là số nguyên từ 1 đến 1440.');
  expect(translateMessage('ja', 'Database error XYZ')).toBe('Database error XYZ');
});

it('has translated entries and matching interpolation parameters for every new UI key', () => {
  for (const key of Object.keys(en).filter(key => key.startsWith('ui.')) as Array<keyof typeof en>) {
    for (const catalog of [ja, vietnamese]) {
      expect(catalog[key], key).not.toBe(en[key]);
      expect(catalog[key].match(/\{\w+\}/g)?.sort() ?? [], key)
        .toEqual(en[key].match(/\{\w+\}/g)?.sort() ?? []);
    }
  }
});
