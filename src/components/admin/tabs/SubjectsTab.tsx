import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { translate } from '../../../i18n';
import { useLanguage } from '../../../contexts/LanguageContext';
import { supabase } from '../../../lib/supabase';
import type { Subject } from '../../../types';
import { emptySubjectForm, type SubjectForm } from '../forms';
export default function SubjectsTab() {
  const { language } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptySubjectForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase.from('subjects').select('*').order('name');
      if (loadError) throw loadError;
      setSubjects((data ?? []) as Subject[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load subjects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() { setForm(emptySubjectForm()); setEditingId('new'); setError(''); }
  function startEdit(s: Subject) { setForm({ name: s.name, description: s.description ?? '', color: s.color ?? '#3B82F6' }); setEditingId(s.id); setError(''); }

  async function handleSave() {
    if (!form.name.trim()) { setError(translate(language, 'adminPage.subjectNameRequired')); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, color: form.color };
      if (editingId === 'new') {
        const { error: err } = await supabase.from('subjects').insert(payload);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('subjects').update(payload).eq('id', editingId!);
        if (err) throw err;
      }
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : translate(language, 'adminPage.failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(translate(language, 'adminPage.deleteSubjectConfirmation'))) return;
    setError('');
    try {
      const { error: deleteError } = await supabase.from('subjects').delete().eq('id', id);
      if (deleteError) throw deleteError;
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : translate(language, 'adminPage.failedToSave'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition">
          <Plus className="w-4 h-4" />{translate(language, 'adminPage.addSubject')}
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">{editingId === 'new' ? translate(language, 'adminPage.addSubject') : translate(language, 'adminPage.editSubject')}</h3>
            <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.subjectName')}</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder={translate(language, 'adminPage.subjectNamePlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.description')}</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder={translate(language, 'adminPage.descriptionOptional')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.color')}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
                <span className="text-sm text-gray-600 font-mono">{form.color}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">{translate(language, 'adminPage.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{translate(language, 'adminPage.save')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{translate(language, 'adminPage.noSubjects')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {subjects.map(s => (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#ccc' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                  {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
