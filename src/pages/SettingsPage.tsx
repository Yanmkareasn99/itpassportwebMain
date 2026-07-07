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
      setProfileMsg({ type: 'err', text: '保存に失敗しました: ' + error.message });
    } else {
      await refreshProfile();
      setProfileMsg({ type: 'ok', text: 'プロフィールを保存しました' });
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
      setTargetMsg({ type: 'err', text: '保存に失敗しました: ' + error.message });
    } else {
      setTargetMsg({ type: 'ok', text: '目標試験日を保存しました' });
    }
    setTargetSaving(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: '新しいパスワードが一致しません' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'err', text: 'パスワードは6文字以上必要です' });
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg({ type: 'err', text: '変更に失敗しました: ' + error.message });
    } else {
      setPasswordMsg({ type: 'ok', text: 'パスワードを変更しました' });
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
    { code: 'ja', label: '日本語', helper: 'Japanese' },
    { code: 'en', label: 'English', helper: '英語' },
    { code: 'vi', label: 'Tiếng Việt', helper: 'ベトナム語' },
  ];

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={language === 'ja' ? '設定' : language === 'en' ? 'Settings' : 'Cài đặt'}
      subtitle={language === 'ja' ? 'アカウント' : language === 'en' ? 'Account' : 'Tài khoản'}
    >
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Multilingual support */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <Languages className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">多言語対応</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {language === 'ja'
                  ? '表示言語を選択できます'
                  : language === 'en'
                    ? 'Choose the display language'
                    : 'Chọn ngôn ngữ hiển thị'}
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
            <h2 className="font-bold text-gray-800">{language === 'ja'
                  ? 'プロフィール'
                  : language === 'en'
                    ? 'Profile'
                    : 'Hồ sơ'}</h2>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {language === 'ja'
                  ? 'お名前'
                  : language === 'en'
                    ? 'Name'
                    : 'Họ và tên'}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5"> {language === 'ja'
                  ? '学籍番号'
                  : language === 'en'
                    ? 'Student ID'
                    : 'Mã số sinh viên'}</label>
              <input
                type="text"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="例: 2024001"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5"> {language === 'ja'
                  ? 'クラス'
                  : language === 'en'
                    ? 'Class'
                    : 'Lớp'}</label>
              <input
                type="text"
                value={className}
                onChange={e => setClassName(e.target.value)}
                placeholder="例: IT科2年A組"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {language === 'ja'
                  ? 'メールアドレス'
                  : language === 'en'
                    ? 'Email Address'
                    : 'Địa chỉ Email'}</label>
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
              {profileSaving ? '保存中...' : '保存する'}
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
              {language === 'ja'
                ? '目標試験日'
                : language === 'en'
                  ? 'Target Exam Date'
                  : 'Ngày thi mục tiêu'}
            </h2>
          </div>

          <form onSubmit={saveTarget} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {language === 'ja'
                  ? '試験名'
                  : language === 'en'
                    ? 'Exam Name'
                    : 'Tên kỳ thi'}
              </label>
              <input
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="例: 基本情報技術者試験"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {language === 'ja'
                  ? '試験日'
                  : language === 'en'
                    ? 'Exam Date'
                    : 'Ngày thi'}
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
                  試験まで <span className="font-bold">
                    {Math.max(0, Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}
                  </span> 日
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
              {targetSaving ? '保存中...' : '保存する'}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="font-bold text-gray-800"> {language === 'ja'
                  ? 'パスワード変更'
                  : language === 'en'
                    ? 'Change Password'
                    : 'Đổi mật khẩu'}</h2>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'ja'
                  ? '新しいパスワード'
                  : language === 'en'
                    ? 'New Password'
                    : 'Mật khẩu mới'}</label>
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
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{language === 'ja'
                  ? '新しいパスワード（確認）'
                  : language === 'en'
                    ? 'Confirm New Password'
                    : 'Xác nhận mật khẩu mới'}</label>
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
              {passwordSaving ? '変更中...' : 'パスワードを変更する'}
            </button>
          </form>
        </div>

      </div>
    </Layout>
  );
}