import { supportedLanguages, translate } from '../i18n';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

function isRegisteredEmailError(message: string) {
  return /user already registered|already registered|already exists/i.test(message);
}

export default function LoginPage() {
  useEffect(() => {
    const root = document.documentElement;
    const previousDarkMode = root.classList.contains('dark');
    const previousColorScheme = root.style.colorScheme;

    root.classList.remove('dark');
    root.style.colorScheme = 'light';

    return () => {
      root.style.colorScheme = previousColorScheme;
      root.classList.toggle('dark', previousDarkMode);
    };
  }, []);

  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const text = {
    subtitle: translate(language, 'loginPage.osakaDenshiLearningSupportSystem'),
    login: translate(language, 'loginPage.signIn'),
    signup: translate(language, 'loginPage.createAccount'),
    loginHelp: translate(language, 'loginPage.signInToContinueLearning'),
    signupHelp: translate(language, 'loginPage.createANewAccount'),
    name: translate(language, 'loginPage.name'),
    studentId: translate(language, 'loginPage.studentIdOptional'),
    email: translate(language, 'loginPage.email'),
    password: translate(language, 'loginPage.password'),
    processing: translate(language, 'loginPage.processing'),
    noAccount: translate(language, 'loginPage.noAccountCreateOne'),
    hasAccount: translate(language, 'loginPage.alreadyHaveAnAccount'),
    loginError: translate(language, 'loginPage.emailOrPasswordIsIncorrect'),
    nameError: translate(language, 'loginPage.pleaseEnterYourName'),
    signupError: translate(language, 'loginPage.failedToCreateAccount'),
    registeredEmailError: translate(language, 'loginPage.emailAlreadyRegistered'),
    confirmationSent: translate(language, 'loginPage.confirmationEmailSentConfirmYourEmailThenSign'),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        if (!name.trim()) { setError(text.nameError); setLoading(false); return; }
        const requiresConfirmation = await signUp(email, password, name, studentId || undefined);
        if (requiresConfirmation) {
          setMode('login');
          setNotice(text.confirmationSent);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (mode === 'login') setError(text.loginError);
      else setError(isRegisteredEmailError(msg) ? text.registeredEmailError : text.signupError + msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      setError(translate(language, 'loginPage.googleLoginFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(168,139,250,0.18),_transparent_35%),linear-gradient(135deg,#eff6ff_0%,#f8fafc_45%,#eef2ff_100%)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-blue-100/70 bg-white/80 shadow-[0_30px_80px_rgba(30,41,59,0.12)] backdrop-blur-md">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1d4ed8] via-[#3b82f6] to-[#7c3aed] p-10 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.22),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_35%)]" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <BookOpen className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight">マナビ</span>
              </div>

              <div className="mt-10 space-y-6">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-100">学習をもっとスマートに</p>
                  <h1 className="mt-3 text-4xl font-black leading-tight text-white">より明確に学び、自信を育てましょう</h1>
                </div>

                <p className="max-w-md text-sm leading-6 text-blue-50/90">
                  {text.subtitle}
                </p>
              </div>
            </div>

            <div className="relative z-10 space-y-4">
              { [
                '分野ごとに学習して着実に上達',
                '毎日で試験準備を管理',
                '弱点をAIと一緒に見直し',
              ].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm shadow-lg shadow-blue-950/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">✓</div>
                  <span className="text-sm text-blue-50">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
            <div className="w-full max-w-md">
              <div className="mb-6 mt-8 text-center">
                <div className="mb-4 hidden items-center justify-center lg:justify-start gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-500/25">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-2xl font-bold text-blue-600">マナビ</span>
                </div>

                <h2 className="text-2xl font-bold text-slate-800 text-center">
                  {mode === 'login' ? text.login : text.signup}
                </h2>
                <p className="mt-2 text-sm text-slate-500 text-center">
                  {mode === 'login' ? text.loginHelp : text.signupHelp}
                </p>
              </div>

              <div className="mb-6 flex justify-center gap-2 rounded-full bg-slate-100 p-1">
                {supportedLanguages.map(code => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLanguage(code)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
                      language === code
                        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>

              {notice && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                  {notice}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{text.name}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={translate(language, 'loginPage.namePlaceholder')}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{text.studentId}</label>
                      <input
                        type="text"
                        value={studentId}
                        onChange={e => setStudentId(e.target.value)}
                        placeholder={translate(language, 'loginPage.studentIdPlaceholder')}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{text.email}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@osaka-denshi.ac.jp"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{text.password}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? text.processing : mode === 'login' ? text.login : text.signup}
                </button>
              </form>

              <div className="mt-5">
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                      {translate(language, 'loginPage.or')}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-700 disabled:opacity-60"
                    onClick={() => void handleGoogleAuth()}
                    disabled={loading}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">G</span>
                    {translate(language, 'loginPage.signInWithGoogle')}
                  </button>
                </div>
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError('');
                  }}
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  {mode === 'login' ? text.noAccount : text.hasAccount}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
