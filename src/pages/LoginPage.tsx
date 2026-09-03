import { supportedLanguages, translate } from '../i18n';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function LoginPage() {
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
      else setError(text.signupError + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="text-3xl font-bold text-blue-600 tracking-tight">マナビ</span>
          </div>
          <p className="text-sm text-gray-500">{text.subtitle}</p>
          <div className="flex justify-center gap-2 mt-4">
            {supportedLanguages.map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${language === code ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            {mode === 'login' ? text.login : text.signup}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'login' ? text.loginHelp : text.signupHelp}
          </p>

          {notice && (
            <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{text.name}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={translate(language, 'loginPage.namePlaceholder')}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{text.studentId}</label>
                  <input
                    type="text"
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    placeholder={translate(language, 'loginPage.studentIdPlaceholder')}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {text.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@osaka-denshi.ac.jp"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{text.password}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mt-2"
            >
              {loading ? text.processing : mode === 'login' ? text.login : text.signup}
            </button>
          </form>

          <div className="mt-4">
            <div className="oauth-divider text-center my-3">
              <span>{translate(language, 'loginPage.or')}</span>
            </div>

            <button
              type="button"
              className={`google-login-button w-full py-2 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2 shadow-sm`}
              onClick={async () => {
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
              }}
              disabled={loading}
            >
              <span className="google-icon mr-2">G</span>
              {translate(language, 'loginPage.signInWithGoogle')}
            </button>
          </div>

          <div className="mt-5 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
            >
              {mode === 'login' ? text.noAccount : text.hasAccount}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {translate(language, 'loginPage.copyright')}
        </p>
      </div>
    </div>
  );
}
