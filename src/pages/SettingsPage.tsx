import { nativeLanguageNames, translate } from '../i18n';
import { useState, useEffect } from 'react';
import {
  Calendar,
  Lock,
  CheckCircle,
  AlertCircle,
  Save,
  Languages,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  UserRound,
  Moon,
  Shuffle,
  Trash2,
  Bug,
} from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Language, useLanguage } from '../contexts/LanguageContext';
import { Page } from '../types';
import { getRandomizeAnswerChoicesPreference, setRandomizeAnswerChoicesPreference } from '../lib/questionRandomization';

const AVATAR_CHOICES = [
  {
    id: 'avatar1',
    labelKey: 'settingsPage.avatarOptionAvatar1',
    src: '/avatars/avatar1.png',
  },
  {
    id: 'avatar2',
    labelKey: 'settingsPage.avatarOptionAvatar2',
    src: '/avatars/avatar2.png',
  },
  {
    id: 'avatar3',
    labelKey: 'settingsPage.avatarOptionAvatar3',
    src: '/avatars/avatar3.png',
  },
  {
    id: 'avatar4',
    labelKey: 'settingsPage.avatarOptionAvatar4',
    src: '/avatars/avatar4.png',
  },
  {
    id: 'avatar5',
    labelKey: 'settingsPage.avatarOptionAvatar5',
    src: '/avatars/avatar5.png',
  },
  {
    id: 'avatar6',
    labelKey: 'settingsPage.avatarOptionAvatar6',
    src: '/avatars/avatar6.png',
  },
  {
    id: 'avatar7',
    labelKey: 'settingsPage.avatarOptionAvatar7',
    src: '/avatars/avatar7.png',
  },
  {
    id: 'avatar8',
    labelKey: 'settingsPage.avatarOptionAvatar8',
    src: '/avatars/avatar8.png',
  },
] as const;

interface SettingsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

type SettingsView = 'home' | 'profile' | 'language' | 'target' | 'password' | 'deleteAccount' | 'help';
const REPORT_ISSUE_URL = 'https://github.com/Yanmkareasn99/itpassportwebMain/issues/new';

export default function SettingsPage({ currentPage, onNavigate }: SettingsPageProps) {
  const { user, profile, refreshProfile, deleteAccount } = useAuth();
  const { language, setLanguage } = useLanguage();

  const [view, setView] = useState<SettingsView>(currentPage === 'profile' ? 'profile' : 'home');
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const savedTheme = window.localStorage.getItem('manabi-theme');
    return savedTheme === 'dark';
  });
  const [randomizeAnswerChoices, setRandomizeAnswerChoices] = useState(
    getRandomizeAnswerChoicesPreference,
  );

  const [name, setName] = useState(profile?.name ?? '');
  const [studentId, setStudentId] = useState(profile?.student_id ?? '');
  const [className, setClassName] = useState(profile?.class_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
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
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [deleteAccountMsg, setDeleteAccountMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setView(currentPage === 'profile' ? 'profile' : 'home');
  }, [currentPage]);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setStudentId(profile.student_id ?? '');
      setClassName(profile.class_name ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
    }
  }, [profile]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    window.localStorage.setItem('manabi-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    setRandomizeAnswerChoicesPreference(randomizeAnswerChoices);
  }, [randomizeAnswerChoices]);

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

  const panelClass = darkMode
    ? 'bg-slate-900 ring-slate-700 text-slate-100'
    : 'bg-white ring-black/5 text-gray-800';
  const panelSubtleClass = darkMode ? 'text-slate-300' : 'text-gray-500';
  const panelMutedClass = darkMode ? 'text-slate-400' : 'text-gray-400';
  const inputClass = darkMode
    ? 'w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
    : 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        student_id: studentId.trim() || null,
        class_name: className.trim() || null,
        avatar_url: avatarUrl || null,
      })
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

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteAccountMsg(null);
    if (deleteConfirmation.trim().toLowerCase() !== (user?.email ?? '').trim().toLowerCase()) {
      setDeleteAccountMsg({ type: 'err', text: translate(language, 'settingsPage.deleteAccountEmailMismatch') });
      return;
    }

    setAccountDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      setDeleteAccountMsg({
        type: 'err',
        text: translate(language, 'settingsPage.deleteAccountFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      });
      setAccountDeleting(false);
    }
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

  function DetailHeader({ title }: { title: string }) {
    function goBack() {
      if (currentPage === 'profile' && (view === 'password' || view === 'deleteAccount')) {
        setView('profile');
      } else if (currentPage === 'profile') {
        onNavigate('settings');
      } else {
        setView('home');
      }
    }

    return (
      <div className="flex items-center gap-3 mb-7">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className={`font-bold text-xl ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>{title}</h2>
      </div>
    );
  }

  function SettingRow({
    icon,
    iconBg,
    iconColor,
    label,
    value,
    onClick,
    href,
  }: {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    label: string;
    value?: string;
    onClick?: () => void;
    href?: string;
  }) {
    const className = `no-press-animation flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`;
    const content = <>
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-inner shadow-white/60"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
          <span className={`text-[15px] font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>{label}</span>
          <div className="flex items-center gap-2 min-w-0">
            {value ? <span className={`text-sm truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{value}</span> : null}
            <ChevronRight className={`w-5 h-5 shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`} />
          </div>
        </div>
      </>;
    return href
      ? <a href={href} className={className}>{content}</a>
      : <button type="button" onClick={onClick} className={className}>{content}</button>;
  }

  const languageOptions: { code: Language; label: string; helper: string }[] = [
    { code: 'ja', label: nativeLanguageNames.ja, helper: translate(language, 'settingsPage.languageJapanese') },
    { code: 'en', label: nativeLanguageNames.en, helper: translate(language, 'settingsPage.languageEnglish') },
    { code: 'vi', label: nativeLanguageNames.vi, helper: translate(language, 'settingsPage.languageVietnamese') },
  ];

  const selectedAvatar = avatarUrl || profile?.avatar_url || '';
  const currentAvatarChoice = AVATAR_CHOICES.find(choice => choice.src === selectedAvatar) ?? null;

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(language, currentPage === 'profile' ? 'settingsPage.profile' : 'settingsPage.settings')}
      subtitle={translate(language, currentPage === 'profile' ? 'settingsPage.account' : 'settingsPage.preferences')}
    >
      <div className="app-shell max-w-3xl mx-auto space-y-6">

        {view === 'home' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 space-y-8 ${panelClass}`}>
            <div>
              <p className={`text-[17px] font-semibold px-1 mb-3 ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                {translate(language, 'settingsPage.preferences')}
              </p>
              <div className="space-y-1">
                <SettingRow
                  icon={<Languages className="w-5 h-5" />}
                  iconBg="#ede9fe"
                  iconColor="#7c3aed"
                  label={translate(language, 'settingsPage.multilingualSupport')}
                  value={nativeLanguageNames[language]}
                  onClick={() => setView('language')}
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={darkMode}
                  onClick={() => setDarkMode(prev => !prev)}
                  className={`no-press-animation flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-inner shadow-white/60"
                    style={{
                      backgroundColor: darkMode ? '#1e293b' : '#e2e8f0',
                      color: darkMode ? '#f8fafc' : '#334155',
                    }}
                  >
                    <Moon className="w-5 h-5" />
                  </div>
                  <span className={`flex-1 text-[15px] font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                    {translate(language, 'settingsPage.darkMode')}
                  </span>
                  <span className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-gray-400'}`}>
                    {darkMode ? translate(language, 'settingsPage.darkModeOn') : translate(language, 'settingsPage.darkModeOff')}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${darkMode ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${darkMode ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={randomizeAnswerChoices}
                  onClick={() => setRandomizeAnswerChoices(current => !current)}
                  className={`no-press-animation flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-inner shadow-white/60">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <span className={`flex-1 text-[15px] font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                    {translate(language, 'settingsPage.randomizeAnswerChoices')}
                  </span>
                  <span className={`text-sm font-medium ${randomizeAnswerChoices ? 'text-blue-500' : darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                    {randomizeAnswerChoices ? translate(language, 'settingsPage.darkModeOn') : translate(language, 'settingsPage.darkModeOff')}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${randomizeAnswerChoices ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${randomizeAnswerChoices ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </span>
                </button>
                <SettingRow
                  icon={<Calendar className="w-5 h-5" />}
                  iconBg="#d1fae5"
                  iconColor="#059669"
                  label={translate(language, 'settingsPage.targetExamDate')}
                  value={targetDate || undefined}
                  onClick={() => setView('target')}
                />
                <SettingRow
                  icon={<HelpCircle className="w-5 h-5" />}
                  iconBg="#fce7f3"
                  iconColor="#db2777"
                  label={translate(language, 'settingsPage.help')}
                  onClick={() => setView('help')}
                />
                <SettingRow
                  icon={<Bug className="w-5 h-5" />}
                  iconBg="#fee2e2"
                  iconColor="#dc2626"
                  label={translate(language, 'settingsPage.reportIssue')}
                  href={REPORT_ISSUE_URL}
                />
              </div>
            </div>
          </div>
        )}

        {view === 'profile' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.profile')} />
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.avatar')}
                </label>
                <p className={`text-xs mb-3 ${panelMutedClass}`}>
                  {translate(language, 'settingsPage.chooseAvatarPreset')}
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
                    {selectedAvatar ? (
                      <img src={selectedAvatar} alt={translate(language, 'settingsPage.avatar')} className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className={`w-8 h-8 ${darkMode ? 'text-slate-400' : 'text-gray-300'}`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${panelSubtleClass}`}>
                      {currentAvatarChoice ? translate(language, currentAvatarChoice.labelKey) : translate(language, 'settingsPage.avatarNone')}
                    </p>
                    <p className={`text-xs ${panelMutedClass}`}>
                      {translate(language, 'settingsPage.avatarHint')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {AVATAR_CHOICES.map(choice => {
                    const active = selectedAvatar === choice.src;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => setAvatarUrl(choice.src)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/40 dark:ring-blue-900/60'
                            : darkMode
                              ? 'border-slate-700 bg-slate-800 hover:border-blue-500 hover:bg-slate-700'
                              : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-center">
                          <img src={choice.src} alt={translate(language, choice.labelKey)} className="h-16 w-16 rounded-full shadow-sm object-cover" />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-700'}`}>
                            {translate(language, choice.labelKey)}
                          </span>
                          {active && <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className={`mt-3 text-sm font-semibold transition ${darkMode ? 'text-slate-300 hover:text-slate-100' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {translate(language, 'settingsPage.avatarNone')}
                </button>
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={translate(language, 'settingsPage.namePlaceholder')}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}> {translate(language, 'settingsPage.studentId')}</label>
                <input
                  type="text"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder={translate(language, 'settingsPage.studentIdPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}> {translate(language, 'settingsPage.class')}</label>
                <input
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder={translate(language, 'settingsPage.classPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.emailAddress')}</label>
                <input
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className={`w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400 cursor-not-allowed ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : ''}`}
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

            <div className={`mt-8 border-t pt-6 ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
              <p className={`mb-2 px-1 text-[17px] font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                {translate(language, 'settingsPage.account')}
              </p>
              <SettingRow
                icon={<Lock className="w-5 h-5" />}
                iconBg="#fef3c7"
                iconColor="#d97706"
                label={translate(language, 'settingsPage.changePassword')}
                onClick={() => setView('password')}
              />

              <div className={`mt-5 rounded-2xl border p-4 ${darkMode ? 'border-red-900/60 bg-red-950/20' : 'border-red-100 bg-red-50/60'}`}>
                <p className={`text-sm font-semibold ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                  {translate(language, 'settingsPage.deleteAccount')}
                </p>
                <p className={`mt-1 text-xs leading-5 ${darkMode ? 'text-red-300/70' : 'text-red-600/80'}`}>
                  {translate(language, 'settingsPage.deleteAccountWarningBody')}
                </p>
                <button
                  type="button"
                  onClick={() => setView('deleteAccount')}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                >
                  <Trash2 className="h-4 w-4" />
                  {translate(language, 'settingsPage.deleteAccount')}
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'language' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.multilingualSupport')} />
            <p className={`text-xs -mt-3 mb-5 ${panelMutedClass}`}>
              {translate(language, 'settingsPage.chooseTheDisplayLanguage')}
            </p>
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
                        ? 'border-violet-400 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-200'
                        : darkMode
                          ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-violet-500 hover:bg-slate-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{option.label}</span>
                      {active && <CheckCircle className="w-4 h-4 text-violet-600" />}
                    </div>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{option.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'target' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.targetExamDate')} />
            <form onSubmit={saveTarget} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.examName')}
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={e => setExamName(e.target.value)}
                  placeholder={translate(language, 'settingsPage.examNamePlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.examDate')}
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              {targetDate && (
                <div className={`px-4 py-3 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-blue-50 border-blue-100'}`}>
                  <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
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
        )}

        {view === 'password' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.changePassword')} />
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>{translate(language, 'settingsPage.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>{translate(language, 'settingsPage.confirmNewPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
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
        )}

        {view === 'deleteAccount' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.deleteAccount')} />
            <div className={`mb-5 rounded-2xl border p-4 ${darkMode ? 'border-red-900/70 bg-red-950/30' : 'border-red-100 bg-red-50'}`}>
              <p className={`text-sm font-semibold ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                {translate(language, 'settingsPage.deleteAccountWarningTitle')}
              </p>
              <p className={`mt-1 text-sm leading-relaxed ${darkMode ? 'text-red-200/80' : 'text-red-600'}`}>
                {translate(language, 'settingsPage.deleteAccountWarningBody')}
              </p>
            </div>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${panelSubtleClass}`}>
                  {translate(language, 'settingsPage.deleteAccountConfirmEmail', { email: user?.email ?? '' })}
                </label>
                <input
                  type="email"
                  value={deleteConfirmation}
                  onChange={event => setDeleteConfirmation(event.target.value)}
                  placeholder={user?.email ?? ''}
                  autoComplete="off"
                  className={inputClass}
                  required
                />
              </div>
              <Feedback msg={deleteAccountMsg} />
              <button
                type="submit"
                disabled={accountDeleting || deleteConfirmation.trim().toLowerCase() !== (user?.email ?? '').trim().toLowerCase()}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {accountDeleting
                  ? translate(language, 'settingsPage.deletingAccount')
                  : translate(language, 'settingsPage.deleteAccountAction')}
              </button>
            </form>
          </div>
        )}

        {view === 'help' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 ${panelClass}`}>
            <DetailHeader title={translate(language, 'settingsPage.help')} />
            <p className={`text-sm -mt-4 mb-5 ${panelMutedClass}`}>
              {translate(language, 'settingsPage.helpIntro')}
            </p>
            <div className="space-y-2">
              {([
                ['practice', 'settingsPage.helpPracticeTitle', 'settingsPage.helpPracticeBody'],
                ['mockExam', 'settingsPage.helpMockExamTitle', 'settingsPage.helpMockExamBody'],
                ['battle', 'settingsPage.helpBattleTitle', 'settingsPage.helpBattleBody'],
                ['points', 'settingsPage.helpPointsTitle', 'settingsPage.helpPointsBody'],
                ['account', 'settingsPage.helpAccountTitle', 'settingsPage.helpAccountBody'],
              ] as const).map(([key, titleKey, bodyKey]) => {
                const isOpen = openFaq === key;
                return (
                  <div key={key} className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : key)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`text-[15px] font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                        {translate(language, titleKey)}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}
                      />
                    </button>
                    {isOpen && (
                      <div className={`px-4 pb-4 text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}>
                        {translate(language, bodyKey)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
