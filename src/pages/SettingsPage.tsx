import { nativeLanguageNames, translate } from '../i18n';
import { useState, useEffect } from 'react';
import { User, Calendar, Lock, CheckCircle, AlertCircle, Save, Languages } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Language, useLanguage } from '../contexts/LanguageContext';
import { Page } from '../types';

interface SettingsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function SettingsPage({ currentPage, onNavigate }: SettingsPageProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { language, setLanguage } = useLanguage();

  const [name, setName] = useState(profile?.name ?? '');
  const [studentId, setStudentId] = useState(profile?.student_id ?? '');
  const [className, setClassName] = useState(profile?.class_name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [targetDate, setTargetDate] = useState('');
  const [examName, setExamName] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetMsg, setTargetMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setStudentId(profile.student_id ?? '');
      setClassName(profile.class_name ?? '');
    }
  }, [profile]);

  useEffect(() => {
    async function loadTarget() {
      const { data } = await supabase
        .from('exam_targets')
        .select('*')
        .maybeSingle();
      if (data) {
        setTargetDate(data.target_date);
        setExamName(data.exam_name ?? '');
      }
    }
    loadTarget();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), student_id: studentId.trim() || null, class_name: className.trim() || null })
      .eq('id', user!.id);
    if (error) {
      setProfileMsg({ type: 'err', text: translate(language, 'settingsPage.profileSaveFailed', { error: error.message }) });
    } else {
      await refreshProfile();
      setProfileMsg({ type: 'ok', text: translate(language, 'settingsPage.profileSaved') });
    }
    setProfileSaving(false);
  }

  async function saveTarget(e: React.FormEvent) {
    e.preventDefault();
    setTargetSaving(true);
    setTargetMsg(null);
    const { error } = await supabase
      .from('exam_targets')
      .upsert({ user_id: user!.id, target_date: targetDate, exam_name: examName.trim() || null }, { onConflict: 'user_id' });
    if (error) {
      setTargetMsg({ type: 'err', text: translate(language, 'settingsPage.profileSaveFailed', { error: error.message }) });
    } else {
      setTargetMsg({ type: 'ok', text: translate(language, 'settingsPage.targetSaved') });
    }
    setTargetSaving(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: translate(language, 'settingsPage.passwordsDoNotMatch') });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'err', text: translate(language, 'settingsPage.passwordMinimum') });
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg({ type: 'err', text: translate(language, 'settingsPage.passwordChangeFailed', { error: error.message }) });
    } else {
      setPasswordMsg({ type: 'ok', text: translate(language, 'settingsPage.passwordChanged') });
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordSaving(false);
  }

  function Feedback({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
    if (!msg) return null;
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
        {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
        {msg.text}
      </div>
    );
  }

  const languageOptions: { code: Language; label: string; helper: string }[] = [
    { code: 'ja', label: nativeLanguageNames.ja, helper: translate(language, 'settingsPage.languageJapanese') },
    { code: 'en', label: nativeLanguageNames.en, helper: translate(language, 'settingsPage.languageEnglish') },
    { code: 'vi', label: nativeLanguageNames.vi, helper: translate(language, 'settingsPage.languageVietnamese') },
  ];

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(language, 'settingsPage.settings')}
      subtitle={translate(language, 'settingsPage.account')}
    >
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Multilingual support */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <Languages className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">{translate(language, 'settingsPage.multilingualSupport')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {translate(language, 'settingsPage.chooseTheDisplayLanguage')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {languageOptions.map(option => {
              const active = language === option.code;
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setLanguage(option.code)}
                  className={`text-left rounded-xl border px-4 py-3 transition ${
                    active
                      ? 'border-violet-400 bg-violet-50 text-violet-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{option.label}</span>
                    {active && <CheckCircle className="w-4 h-4 text-violet-600" />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{option.helper}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-gray-800">{translate(language, 'settingsPage.profile')}</h2>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {translate(language, 'settingsPage.name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={translate(language, 'settingsPage.namePlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5"> {translate(language, 'settingsPage.studentId')}</label>
              <input
                type="text"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder={translate(language, 'settingsPage.studentIdPlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5"> {translate(language, 'settingsPage.class')}</label>
              <input
                type="text"
                value={className}
                onChange={e => setClassName(e.target.value)}
                placeholder={translate(language, 'settingsPage.classPlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {translate(language, 'settingsPage.emailAddress')}</label>
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400 cursor-not-allowed"
              />
            </div>
            <Feedback msg={profileMsg} />
            <button
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {profileSaving ? translate(language, 'settingsPage.saving') : translate(language, 'settingsPage.saveAction')}
            </button>
          </form>
        </div>

        {/* Exam target */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="font-bold text-gray-800">
              {translate(language, 'settingsPage.targetExamDate')}
            </h2>
          </div>

          <form onSubmit={saveTarget} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {translate(language, 'settingsPage.examName')}
              </label>
              <input
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder={translate(language, 'settingsPage.examNamePlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {translate(language, 'settingsPage.examDate')}
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>
            {targetDate && (
              <div className="px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-700">
                  {translate(language, 'settingsPage.daysUntilExam', {
                    count: Math.max(0, Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
                  })}
                </p>
              </div>
            )}
            <Feedback msg={targetMsg} />
            <button
              type="submit"
              disabled={targetSaving || !targetDate}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {targetSaving ? translate(language, 'settingsPage.saving') : translate(language, 'settingsPage.saveAction')}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="font-bold text-gray-800"> {translate(language, 'settingsPage.changePassword')}</h2>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{translate(language, 'settingsPage.newPassword')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{translate(language, 'settingsPage.confirmNewPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
                minLength={6}
              />
            </div>
            <Feedback msg={passwordMsg} />
            <button
              type="submit"
              disabled={passwordSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              {passwordSaving ? translate(language, 'settingsPage.changing') : translate(language, 'settingsPage.changePasswordAction')}
            </button>
          </form>
        </div>

      </div>
    </Layout>
  );
}
