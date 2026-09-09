import { useEffect, useState } from 'react';
import { DEFAULT_MOCK_EXAM_SETTINGS, fetchMockExamSettings, saveMockExamSettings } from '../../../lib/mockExamSettings';

export default function MockExamTab() {
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
        <h2 className="text-lg font-bold text-gray-800">Mock exam settings</h2>
        <p className="text-sm text-gray-500 mt-1">Changes apply to new exams for all students. Exams already in progress keep their original settings.</p>
      </div>
      {loading && <p role="status">Loading settings...</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">Mock exam settings saved.</p>}
      <fieldset disabled={loading || !loaded || saving} className="space-y-4 disabled:opacity-50">
        {([
          ['question_count', 'Question count', 1, 1000],
          ['duration_minutes', 'Time limit (minutes)', 1, 1440],
          ['passing_score_percent', 'Passing score (%)', 0, 100],
        ] as const).map(([key, label, min, max]) => (
          <label key={key} className="block text-sm font-medium text-gray-700">
            {label}
            <input type="number" required min={min} max={max} step={1} value={Number.isNaN(settings[key]) ? '' : settings[key]}
              onChange={event => { setSaved(false); setSettings(current => ({ ...current, [key]: event.target.valueAsNumber })); }}
              className="block w-full mt-1 rounded-xl border border-gray-200 px-3 py-2" />
          </label>
        ))}
        <p className="text-xs text-gray-500">The question bank must contain at least the configured number of questions.</p>
        <button type="submit" className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold">{saving ? 'Saving...' : 'Save settings'}</button>
      </fieldset>
    </form>
  );
}
