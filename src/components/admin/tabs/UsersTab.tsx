import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { languageLocales, translate } from '../../../i18n';
import { useLanguage } from '../../../contexts/LanguageContext';
import { supabase } from '../../../lib/supabase';
import type { Profile } from '../../../types';
export default function UsersTab() {
  const { language } = useLanguage();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (loadError) throw loadError;
      setUsers((data ?? []) as Profile[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAdmin(user: Profile) {
    setSaving(user.id);
    setError('');
    const { error: updateError } = await supabase.rpc('set_profile_admin', {
      target_user_id: user.id,
      new_is_admin: !user.is_admin,
    });
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{loading ? translate(language, 'adminPage.loading') : translate(language, 'adminPage.userCount', { count: users.length })}</span>
        <button onClick={load} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-600 bg-red-50">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{translate(language, 'adminPage.noUsers')}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-4 p-4">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-blue-600">{u.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                <p className="text-xs text-gray-400">
                  {u.student_id && translate(language, 'adminPage.studentIdValue', { value: u.student_id })}
                  {u.class_name && translate(language, 'adminPage.classValue', { value: u.class_name })}
                  {new Date(u.created_at).toLocaleDateString(languageLocales[language])}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {u.is_admin && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />{translate(language, 'adminPage.administrator')}
                  </span>
                )}
                <button
                  onClick={() => toggleAdmin(u)}
                  disabled={saving === u.id}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                    u.is_admin
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  } disabled:opacity-50`}
                >
                  {saving === u.id
                    ? '...'
                    : u.is_admin
                      ? translate(language, 'adminPage.removeAdministrator')
                      : translate(language, 'adminPage.makeAdministrator')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
