import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Language, useLanguage } from '../contexts/LanguageContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const text = {
    subtitle: language === 'ja' ? '大阪電子専門学校 学習支援システム' : language === 'en' ? 'Osaka Denshi learning support system' : 'Hệ thống hỗ trợ học tập Osaka Denshi',
    login: language === 'ja' ? 'ログイン' : language === 'en' ? 'Sign in' : 'Đăng nhập',
    signup: language === 'ja' ? 'アカウント作成' : language === 'en' ? 'Create account' : 'Tạo tài khoản',
    loginHelp: language === 'ja' ? 'パスワードを受け取ろう！' : language === 'en' ? 'Sign in to continue learning.' : 'Đăng nhập để tiếp tục học.',
    signupHelp: language === 'ja' ? '新しいアカウントを作成します' : language === 'en' ? 'Create a new account.' : 'Tạo tài khoản mới.',
    name: language === 'ja' ? 'お名前' : language === 'en' ? 'Name' : 'Họ tên',
    studentId: language === 'ja' ? '学籍番号（任意）' : language === 'en' ? 'Student ID (optional)' : 'Mã sinh viên (tùy chọn)',
    email: language === 'ja' ? 'メール' : language === 'en' ? 'Email' : 'Email',
    password: language === 'ja' ? 'パスワード' : language === 'en' ? 'Password' : 'Mật khẩu',
    processing: language === 'ja' ? '処理中...' : language === 'en' ? 'Processing...' : 'Đang xử lý...',
    noAccount: language === 'ja' ? 'アカウントをお持ちでない方はこちら' : language === 'en' ? 'No account? Create one' : 'Chưa có tài khoản? Tạo mới',
    hasAccount: language === 'ja' ? 'すでにアカウントをお持ちの方' : language === 'en' ? 'Already have an account?' : 'Đã có tài khoản?',
    loginError: language === 'ja' ? 'メールアドレスまたはパスワードが正しくありません。' : language === 'en' ? 'Email or password is incorrect.' : 'Email hoặc mật khẩu không chính xác.',
    nameError: language === 'ja' ? '名前を入力してください。' : language === 'en' ? 'Please enter your name.' : 'Vui lòng nhập tên của bạn.',
    signupError: language === 'ja' ? 'アカウント作成に失敗しました: ' : language === 'en' ? 'Failed to create account: ' : 'Tạo tài khoản thất bại: ',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(text.loginError);
    } else {
      if (!name.trim()) { setError(text.nameError); setLoading(false); return; }
      const { error } = await signUp(email, password, name, studentId || undefined);
      if (error) setError(text.signupError + error.message);
    }
    setLoading(false);
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
            {(['ja', 'en', 'vi'] as Language[]).map(code => (
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{text.name}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="山田 太郎"
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
                    placeholder="例: 2024001"
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
          © 2024 大阪電子専門学校 マナビ
        </p>
      </div>
    </div>
  );
}