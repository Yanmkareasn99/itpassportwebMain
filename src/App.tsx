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
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading...</p>
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
  const navigate = useNavigate();
  const onNavigate = usePageNavigation();

  return (
    <PracticeListPage
      currentPage="practice-list"
      onNavigate={onNavigate}
      onStartPractice={(subjectId: string, questions: Question[]) => {
        navigate('/practice/session', { state: { subjectId, questions } });
      }}
    />
  );
}

function PracticeSessionRoute() {
  const onNavigate = usePageNavigation();
  const location = useLocation();
  const state = location.state as { subjectId?: string; questions?: Question[] } | null;

  if (!state?.questions?.length) {
    return <Navigate to="/practice" replace />;
  }

  return (
    <PracticeQuestionPage
      currentPage="practice-question"
      onNavigate={onNavigate}
      questions={state.questions}
      subjectId={state.subjectId ?? 'all'}
    />
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
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
