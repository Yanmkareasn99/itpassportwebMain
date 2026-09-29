import { useEffect, useState } from 'react';
import { ChevronDown, Megaphone, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { languageLocales, translate } from '../../../i18n';
import {
  deleteAnnouncement,
  fetchAnnouncements,
  saveAnnouncement,
  type Announcement,
  type AnnouncementInput,
  type AnnouncementSeverity,
} from '../../../lib/announcements';

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const emptyForm = (): AnnouncementInput => ({
  title_ja: '',
  title_en: '',
  title_vi: '',
  message_ja: '',
  message_en: '',
  message_vi: '',
  severity: 'info',
  priority: 0,
  is_active: true,
  starts_at: localDateTimeValue(),
  ends_at: null,
});

function toForm(announcement: Announcement): AnnouncementInput {
  return {
    title_ja: announcement.title_ja,
    title_en: announcement.title_en,
    title_vi: announcement.title_vi,
    message_ja: announcement.message_ja,
    message_en: announcement.message_en,
    message_vi: announcement.message_vi,
    severity: announcement.severity,
    priority: announcement.priority,
    is_active: announcement.is_active,
    starts_at: localDateTimeValue(new Date(announcement.starts_at)),
    ends_at: announcement.ends_at ? localDateTimeValue(new Date(announcement.ends_at)) : null,
  };
}

export default function AnnouncementsTab() {
  const { language } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setAnnouncements(await fetchAnnouncements());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate(language, 'adminPage.announcementLoadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setForm(emptyForm());
    setEditingId(undefined);
    setSaved(false);
  }

  function toggleForm() {
    resetForm();
    setShowForm(current => !current);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (![form.message_ja, form.message_en, form.message_vi].some(message => message.trim())) {
      setError(translate(language, 'adminPage.announcementMessageRequired'));
      return;
    }
    const startsAt = new Date(form.starts_at);
    const endsAt = form.ends_at ? new Date(form.ends_at) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && endsAt <= startsAt)) {
      setError(translate(language, 'adminPage.announcementDateInvalid'));
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveAnnouncement({
        ...form,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() ?? null,
      }, editingId);
      resetForm();
      setSaved(true);
      setShowForm(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : translate(language, 'adminPage.announcementSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(announcement: Announcement) {
    if (!window.confirm(translate(language, 'adminPage.announcementDeleteConfirm'))) return;
    setError('');
    try {
      await deleteAnnouncement(announcement.id);
      if (editingId === announcement.id) {
        resetForm();
        setShowForm(false);
      }
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : translate(language, 'adminPage.announcementDeleteFailed'));
    }
  }

  const languageFields = [
    ['ja', translate(language, 'adminPage.japanese')],
    ['en', translate(language, 'adminPage.english')],
    ['vi', translate(language, 'adminPage.vietnamese')],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={toggleForm}
          aria-expanded={showForm}
          aria-controls="announcement-form"
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-gray-50"
        >
          <span className="flex items-center gap-2 text-lg font-bold text-gray-800">
              <Megaphone className="h-5 w-5 text-blue-600" />
              {editingId ? translate(language, 'adminPage.editAnnouncement') : translate(language, 'adminPage.newAnnouncement')}
          </span>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showForm ? 'rotate-180' : ''}`} />
        </button>

        {error && <p role="alert" className="mx-6 mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {saved && <p role="status" className="mx-6 mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{translate(language, 'adminPage.announcementSaved')}</p>}

        {showForm && (
          <form id="announcement-form" onSubmit={submit} className="border-t border-gray-100 px-6 pb-6 pt-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <p className="text-sm text-gray-500">{translate(language, 'adminPage.announcementHelp')}</p>
              {editingId && (
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="shrink-0 text-sm font-semibold text-gray-500 hover:text-gray-700">
                  {translate(language, 'adminPage.cancel')}
                </button>
              )}
            </div>
            <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
          <div className="grid gap-4 lg:grid-cols-3">
            {languageFields.map(([code, label]) => (
              <div key={code} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="text-sm font-bold text-gray-700">{label}</h3>
                <label className="block text-xs font-semibold text-gray-600">
                  {translate(language, 'adminPage.announcementTitle')}
                  <input
                    value={form[`title_${code}`]}
                    onChange={event => setForm(current => ({ ...current, [`title_${code}`]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  {translate(language, 'adminPage.announcementMessage')}
                  <textarea
                    rows={4}
                    value={form[`message_${code}`]}
                    onChange={event => setForm(current => ({ ...current, [`message_${code}`]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-gray-600">
              {translate(language, 'adminPage.announcementSeverity')}
              <select value={form.severity} onChange={event => setForm(current => ({ ...current, severity: event.target.value as AnnouncementSeverity }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="info">{translate(language, 'adminPage.announcementInfo')}</option>
                <option value="warning">{translate(language, 'adminPage.announcementWarning')}</option>
                <option value="urgent">{translate(language, 'adminPage.announcementUrgent')}</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              {translate(language, 'adminPage.announcementPriority')}
              <input type="number" min={0} max={100} value={form.priority}
                onChange={event => setForm(current => ({ ...current, priority: event.target.valueAsNumber }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              {translate(language, 'adminPage.announcementStarts')}
              <input type="datetime-local" required value={form.starts_at}
                onChange={event => setForm(current => ({ ...current, starts_at: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              {translate(language, 'adminPage.announcementEnds')}
              <input type="datetime-local" value={form.ends_at ?? ''}
                onChange={event => setForm(current => ({ ...current, ends_at: event.target.value || null }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={form.is_active}
                onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300" />
              {translate(language, 'adminPage.announcementActive')}
            </label>
            <button type="submit" className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {saving ? translate(language, 'ui.saving') : translate(language, 'adminPage.save')}
            </button>
          </div>
            </fieldset>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-gray-800">{translate(language, 'adminPage.announcements')}</h2>
          <button type="button" onClick={() => void load()} aria-label={translate(language, 'adminPage.refreshAnnouncements')} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {!loading && announcements.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">{translate(language, 'adminPage.noAnnouncements')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {announcements.map(item => (
              <article key={item.id} className="flex items-start gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.severity === 'urgent' ? 'bg-red-100 text-red-700' : item.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {translate(language, `adminPage.announcement${item.severity[0].toUpperCase()}${item.severity.slice(1)}` as Parameters<typeof translate>[1])}
                    </span>
                    {!item.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{translate(language, 'adminPage.announcementInactive')}</span>}
                    <span className="text-xs text-gray-400">{translate(language, 'adminPage.announcementPriority')}: {item.priority}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-gray-800">{item.title_ja || item.title_en || item.title_vi || translate(language, 'adminPage.untitledAnnouncement')}</h3>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-gray-500">{item.message_ja || item.message_en || item.message_vi}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    {new Date(item.starts_at).toLocaleString(languageLocales[language])}
                    {' – '}
                    {item.ends_at ? new Date(item.ends_at).toLocaleString(languageLocales[language]) : translate(language, 'adminPage.announcementNoEnd')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => { setEditingId(item.id); setForm(toForm(item)); setSaved(false); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    aria-label={translate(language, 'adminPage.editAnnouncement')} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void remove(item)} aria-label={translate(language, 'adminPage.deleteAnnouncement')}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
