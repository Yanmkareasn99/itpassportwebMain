import { translateMessage, translate } from './i18n';
import { useLanguage } from './contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { createPracticeSession, loadPracticeSession, practiceErrorMessage } from './lib/practice';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AIChatPage from './pages/AIChatPage';
import AdminPage from './pages/AdminPage';
import BattlePage from './pages/BattlePage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MaterialsPage from './pages/MaterialsPage';
import MockExamPage from './pages/MockExamPage';
import PracticeListPage from './pages/PracticeListPage';
import PracticeQuestionPage from './pages/PracticeQuestionPage';
import SettingsPage from './pages/SettingsPage';
import type { Page, Question } from './types';

const pagePaths: Record<Page, string> = {
  home: '/',
  'practice-list': '/practice',
  'practice-question': '/practice/session',
  'mock-exam': '/mock-exam',
  battle: '/battle',
  'ai-chat': '/ai-chat',
  materials: '/materials',
  settings: '/settings',
  results: '/results',
  admin: '/admin',
};

function LoadingScreen() {
  const { language } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">{translate(language, 'ui.loading')}</p>
      </div>
    </div>
  );
}

function usePageNavigation() {
  const navigate = useNavigate();

  return (page: Page) => {
    navigate(pagePaths[page] ?? pagePaths.home);
  };
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { isAdmin, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;

  return <LoginPage />;
}

function PracticeListRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const onNavigate = usePageNavigation();

  return (
    <PracticeListPage
      currentPage="practice-list"
      onNavigate={onNavigate}
      onStartPractice={async (subjectId: string, questions: Question[]) => {
        if (!user) return;
        const id = await createPracticeSession(user.id, subjectId, questions);
        navigate(`/practice/session?id=${encodeURIComponent(id)}`);
      }}
    />
  );
}

function PracticeSessionRoute() {
  const { language } = useLanguage();
  const onNavigate = usePageNavigation();
  const { user } = useAuth();
  const location = useLocation();
  const userId = user?.id;
  const sessionId = new URLSearchParams(location.search).get('id');
  const [loaded, setLoaded] = useState<{ id: string; data: Awaited<ReturnType<typeof loadPracticeSession>> } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId || !sessionId) return;
    let cancelled = false;
    setError('');
    setLoaded(null);
    loadPracticeSession(userId, sessionId).then(data => {
      if (!cancelled) setLoaded({ id: sessionId, data });
    }).catch(error => {
      if (!cancelled) setError(practiceErrorMessage(error, 'Unable to restore practice session.'));
    });
    return () => { cancelled = true; };
  }, [userId, sessionId, attempt]);

  if (!sessionId) return <Navigate to="/practice" replace />;
  if (error) return (
    <div className="max-w-lg mx-auto p-8 space-y-4">
      <p role="alert">{translateMessage(language, error)}</p>
      <button className="mr-4 text-blue-600" onClick={() => setAttempt(value => value + 1)}>{translate(language, 'ui.retry')}</button>
      <button className="text-blue-600" onClick={() => onNavigate('practice-list')}>{translate(language, 'ui.backPractice')}</button>
    </div>
  );
  if (!loaded || loaded.id !== sessionId) return <LoadingScreen />;
  return (
    <PracticeQuestionPage key={sessionId} currentPage="practice-question" onNavigate={onNavigate}
      questions={loaded.data.questions} sessionId={sessionId}
      initialAnswers={loaded.data.answers} initiallyFinished={loaded.data.finished} />
  );
}

function AppRoutes() {
  const onNavigate = usePageNavigation();

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<ProtectedRoute><HomePage currentPage="home" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/practice" element={<ProtectedRoute><PracticeListRoute /></ProtectedRoute>} />
      <Route path="/practice/session" element={<ProtectedRoute><PracticeSessionRoute /></ProtectedRoute>} />
      <Route path="/mock-exam" element={<ProtectedRoute><MockExamPage currentPage="mock-exam" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/battle" element={<ProtectedRoute><BattlePage currentPage="battle" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/ai-chat" element={<ProtectedRoute><AIChatPage currentPage="ai-chat" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><MaterialsPage currentPage="materials" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage currentPage="settings" onNavigate={onNavigate} /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminPage currentPage="admin" onNavigate={onNavigate} /></AdminRoute></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    const savedTheme = window.localStorage.getItem('manabi-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', shouldUseDark);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
