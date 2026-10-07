import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translate } from '../i18n';

export default function GoogleAccountSetupPage() {
  const {
    user,
    profile,
    completeGooglePasswordSetup,
    signOut,
  } = useAuth();
  const { language } = useLanguage();
  const [name, setName] = useState(
    profile?.name
      ?? String(user?.user_metadata.name ?? user?.user_metadata.full_name ?? ''),
  );
  const [studentId, setStudentId] = useState(profile?.student_id ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(current => current || profile.name || '');
    setStudentId(current => current || profile.student_id || '');
  }, [profile]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(translate(language, 'loginPage.pleaseEnterYourName'));
      return;
    }
    if (password.length < 6) {
      setError(translate(language, 'loginPage.passwordMinimum'));
      return;
    }
    if (password !== confirmPassword) {
      setError(translate(language, 'loginPage.passwordsDoNotMatch'));
      return;
    }

    setSaving(true);
    try {
      await completeGooglePasswordSetup({ password, name, studentId });
    } catch (setupError) {
      setError(translate(language, 'googleSetupPage.failed', {
        error: setupError instanceof Error ? setupError.message : String(setupError),
      }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(168,139,250,0.18),_transparent_35%),linear-gradient(135deg,#eff6ff_0%,#f8fafc_45%,#eef2ff_100%)] p-4 sm:p-6">
      <section className="w-full max-w-lg rounded-3xl border border-blue-100/70 bg-white/90 p-6 shadow-[0_30px_80px_rgba(30,41,59,0.12)] backdrop-blur-md sm:p-9">
        <div className="text-center">
          <BrandLogo alt={translate(language, 'loginPage.brand')} />
          <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            {translate(language, 'googleSetupPage.title')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {translate(language, 'googleSetupPage.help')}
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="google-setup-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {translate(language, 'loginPage.email')}
            </label>
            <input
              id="google-setup-email"
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="google-setup-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {translate(language, 'loginPage.name')}
            </label>
            <input
              id="google-setup-name"
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              required
            />
          </div>

          <div>
            <label htmlFor="google-setup-student-id" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {translate(language, 'loginPage.studentIdOptional')}
            </label>
            <input
              id="google-setup-student-id"
              type="text"
              value={studentId}
              onChange={event => setStudentId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="google-setup-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {translate(language, 'loginPage.newPassword')}
            </label>
            <div className="relative">
              <input
                id="google-setup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-700 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(current => !current)}
                aria-label={translate(language, showPassword ? 'loginPage.hidePassword' : 'loginPage.showPassword')}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {translate(language, 'googleSetupPage.passwordHint')}
            </p>
          </div>

          <div>
            <label htmlFor="google-setup-confirm-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {translate(language, 'loginPage.confirmNewPassword')}
            </label>
            <input
              id="google-setup-confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {translate(language, saving ? 'googleSetupPage.saving' : 'googleSetupPage.complete')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          disabled={saving}
          className="mt-4 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60"
        >
          {translate(language, 'googleSetupPage.signOut')}
        </button>
      </section>
    </main>
  );
}
