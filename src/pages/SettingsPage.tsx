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
} from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Language, useLanguage } from '../contexts/LanguageContext';
import { Page } from '../types';

function toAvatarDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const AVATAR_CHOICES = [
  {
    id: 'sun',
    labelKey: 'settingsPage.avatarOptionSun',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#f97316"/>
        <path d="M64 16l8.2 18.9 20.5 1.8-15.5 13.3 4.7 19.9L64 39.2 46.1 69l4.7-19.9L35.3 36.7l20.5-1.8L64 16Z" fill="#fde68a"/>
        <circle cx="64" cy="70" r="28" fill="#fff7ed"/>
        <circle cx="54" cy="64" r="4" fill="#7c2d12"/>
        <circle cx="74" cy="64" r="4" fill="#7c2d12"/>
        <path d="M54 78c4 5 16 5 20 0" fill="none" stroke="#7c2d12" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'robot',
    labelKey: 'settingsPage.avatarOptionRobot',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#0284c7"/>
        <rect x="29" y="34" width="70" height="56" rx="20" fill="#e0f2fe"/>
        <rect x="39" y="46" width="50" height="22" rx="11" fill="#0f172a"/>
        <circle cx="53" cy="57" r="4" fill="#67e8f9"/>
        <circle cx="75" cy="57" r="4" fill="#67e8f9"/>
        <rect x="49" y="74" width="30" height="8" rx="4" fill="#38bdf8"/>
        <circle cx="64" cy="22" r="8" fill="#bae6fd"/>
        <rect x="62" y="12" width="4" height="14" rx="2" fill="#bae6fd"/>
      </svg>
    `),
  },
  {
    id: 'fox',
    labelKey: 'settingsPage.avatarOptionFox',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#16a34a"/>
        <path d="M34 38 48 20 58 42Z" fill="#fb923c"/>
        <path d="M94 38 80 20 70 42Z" fill="#fb923c"/>
        <circle cx="64" cy="70" r="30" fill="#ffedd5"/>
        <path d="M42 52c8-10 36-10 44 0" fill="none" stroke="#fb923c" stroke-width="10" stroke-linecap="round"/>
        <circle cx="54" cy="66" r="4" fill="#7c2d12"/>
        <circle cx="74" cy="66" r="4" fill="#7c2d12"/>
        <path d="M54 80c3 4 17 4 20 0" fill="none" stroke="#7c2d12" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'space',
    labelKey: 'settingsPage.avatarOptionSpace',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#7c3aed"/>
        <circle cx="64" cy="68" r="31" fill="#e0e7ff"/>
        <rect x="48" y="22" width="32" height="16" rx="8" fill="#c4b5fd"/>
        <circle cx="52" cy="63" r="4" fill="#312e81"/>
        <circle cx="76" cy="63" r="4" fill="#312e81"/>
        <path d="M54 77c4 5 16 5 20 0" fill="none" stroke="#312e81" stroke-width="5" stroke-linecap="round"/>
        <circle cx="98" cy="30" r="5" fill="#fef08a"/>
        <circle cx="26" cy="36" r="3" fill="#fef08a"/>
        <circle cx="100" cy="84" r="3" fill="#fef08a"/>
      </svg>
    `),
  },
  {
    id: 'cat',
    labelKey: 'settingsPage.avatarOptionCat',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#db2777"/>
        <path d="M34 44 44 22 56 40Z" fill="#f9a8d4"/>
        <path d="M94 44 84 22 72 40Z" fill="#f9a8d4"/>
        <circle cx="64" cy="68" r="30" fill="#fff1f2"/>
        <circle cx="53" cy="64" r="4" fill="#831843"/>
        <circle cx="75" cy="64" r="4" fill="#831843"/>
        <path d="M58 77c2 2 10 2 12 0" fill="none" stroke="#831843" stroke-width="4" stroke-linecap="round"/>
        <path d="M34 68h16M34 76h14M78 68h16M80 76h14" stroke="#831843" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'panda',
    labelKey: 'settingsPage.avatarOptionPanda',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#111827"/>
        <circle cx="64" cy="68" r="31" fill="#f8fafc"/>
        <circle cx="48" cy="56" r="11" fill="#111827"/>
        <circle cx="80" cy="56" r="11" fill="#111827"/>
        <circle cx="48" cy="56" r="4" fill="#f8fafc"/>
        <circle cx="80" cy="56" r="4" fill="#f8fafc"/>
        <circle cx="55" cy="68" r="4" fill="#111827"/>
        <circle cx="73" cy="68" r="4" fill="#111827"/>
        <path d="M55 80c4 5 14 5 18 0" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'star',
    labelKey: 'settingsPage.avatarOptionStar',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#0f766e"/>
        <circle cx="64" cy="68" r="29" fill="#ccfbf1"/>
        <path d="M64 24l8 18 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2 8-18Z" fill="#f59e0b"/>
        <circle cx="54" cy="64" r="4" fill="#134e4a"/>
        <circle cx="74" cy="64" r="4" fill="#134e4a"/>
        <path d="M55 78c4 4 14 4 18 0" fill="none" stroke="#134e4a" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'book',
    labelKey: 'settingsPage.avatarOptionBook',
    src: toAvatarDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-hidden="true">
        <rect width="128" height="128" rx="32" fill="#475569"/>
        <rect x="28" y="30" width="72" height="66" rx="18" fill="#e2e8f0"/>
        <path d="M42 40h18c6 0 10 4 10 10v34c0-6-4-10-10-10H42c-4 0-8 3-8 8V48c0-4 4-8 8-8Z" fill="#38bdf8"/>
        <path d="M86 40H68c-6 0-10 4-10 10v34c0-6 4-10 10-10h18c4 0 8 3 8 8V48c0-4-4-8-8-8Z" fill="#f59e0b"/>
        <circle cx="50" cy="70" r="4" fill="#0f172a"/>
        <circle cx="78" cy="70" r="4" fill="#0f172a"/>
        <path d="M52 82c4 4 20 4 24 0" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
] as const;

interface SettingsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

type SettingsView = 'home' | 'profile' | 'language' | 'target' | 'password' | 'help';

export default function SettingsPage({ currentPage, onNavigate }: SettingsPageProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { language, setLanguage } = useLanguage();

  const [view, setView] = useState<SettingsView>('home');
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const savedTheme = window.localStorage.getItem('manabi-theme');
    return savedTheme === 'dark';
  });

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
    return (
      <div className="flex items-center gap-3 mb-7">
        <button
          type="button"
          onClick={() => setView('home')}
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
  }: {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    label: string;
    value?: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`no-press-animation flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
      >
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
      </button>
    );
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
      title={translate(language, 'settingsPage.settings')}
      subtitle={translate(language, 'settingsPage.account')}
    >
      <div className="app-shell max-w-3xl mx-auto space-y-6">

        {view === 'home' && (
          <div className={`rounded-[28px] shadow-[0_20px_40px_rgba(15,23,42,0.06)] ring-1 p-7 space-y-8 ${panelClass}`}>
            <div>
              <p className={`text-[17px] font-semibold px-1 mb-3 ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                {translate(language, 'settingsPage.account')}
              </p>
              <button
                type="button"
                onClick={() => setView('profile')}
                className="no-press-animation flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition profile-gradient hover:opacity-95"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full profile-avatar-gradient shadow-inner">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={translate(language, 'settingsPage.avatar')} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="w-7 h-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] font-semibold truncate ${darkMode ? 'text-slate-100' : 'text-gray-800'}`}>{name || user?.email}</p>
                  <p className={`text-[13px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{translate(language, 'sidebar.student')}</p>
                </div>
                <ChevronRight className={`w-5 h-5 shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`} />
              </button>
            </div>

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
                <SettingRow
                  icon={<Calendar className="w-5 h-5" />}
                  iconBg="#d1fae5"
                  iconColor="#059669"
                  label={translate(language, 'settingsPage.targetExamDate')}
                  value={targetDate || undefined}
                  onClick={() => setView('target')}
                />
                <SettingRow
                  icon={<Lock className="w-5 h-5" />}
                  iconBg="#fef3c7"
                  iconColor="#d97706"
                  label={translate(language, 'settingsPage.changePassword')}
                  onClick={() => setView('password')}
                />
                <SettingRow
                  icon={<HelpCircle className="w-5 h-5" />}
                  iconBg="#fce7f3"
                  iconColor="#db2777"
                  label={translate(language, 'settingsPage.help')}
                  onClick={() => setView('help')}
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
                          <img src={choice.src} alt={translate(language, choice.labelKey)} className="h-16 w-16 rounded-full shadow-sm" />
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
