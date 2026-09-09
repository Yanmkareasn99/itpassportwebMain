import { translateMessage, translate } from '../../../i18n';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { DEFAULT_MOCK_EXAM_SETTINGS, fetchMockExamSettings, saveMockExamSettings } from '../../../lib/mockExamSettings';

export default function MockExamTab() {
  const { language } = useLanguage();
  const [settings, setSettings] = useState(DEFAULT_MOCK_EXAM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMockExamSettings().then(value => {
      if (!cancelled) { setSettings(value); setLoaded(true); }
    }).catch(() => {
      if (!cancelled) setError('Unable to load mock exam settings. Check the database migration and reload this tab.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <form className="max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5" onSubmit={async event => {
      event.preventDefault();
      if (!loaded || saving) return;
      setSaving(true); setError(''); setSaved(false);
      try {
        setSettings(await saveMockExamSettings(settings));
        setSaved(true);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save mock exam settings.');
      } finally { setSaving(false); }
    }}>
      <div>
        <h2 className="text-lg font-bold text-gray-800">{translate(language, 'ui.mockSettings')}</h2>
        <p className="text-sm text-gray-500 mt-1">{translate(language, 'ui.mockHelp')}</p>
      </div>
      {loading && <p role="status">{translate(language, 'ui.loadingSettings')}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{translateMessage(language, error)}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">{translate(language, 'ui.settingsSaved')}</p>}
      <fieldset disabled={loading || !loaded || saving} className="space-y-4 disabled:opacity-50">
        {([
          ['question_count', translate(language, 'ui.questionCount'), 1, 1000],
          ['duration_minutes', translate(language, 'ui.timeMinutes'), 1, 1440],
          ['passing_score_percent', translate(language, 'ui.passingPercent'), 0, 100],
        ] as const).map(([key, label, min, max]) => (
          <label key={key} className="block text-sm font-medium text-gray-700">
            {label}
            <input type="number" required min={min} max={max} step={1} value={Number.isNaN(settings[key]) ? '' : settings[key]}
              onChange={event => { setSaved(false); setSettings(current => ({ ...current, [key]: event.target.valueAsNumber })); }}
              className="block w-full mt-1 rounded-xl border border-gray-200 px-3 py-2" />
          </label>
        ))}
        <p className="text-xs text-gray-500">{translate(language, 'ui.questionBankHelp')}</p>
        <button type="submit" className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold">{saving ? translate(language, 'ui.saving') : translate(language, 'ui.saveSettings')}</button>
      </fieldset>
    </form>
  );
}
