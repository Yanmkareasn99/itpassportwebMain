import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PracticeListPage from './pages/PracticeListPage';
import PracticeQuestionPage from './pages/PracticeQuestionPage';
import MockExamPage from './pages/MockExamPage';
import BattlePage from './pages/BattlePage';
import AIChatPage from './pages/AIChatPage';
import MaterialsPage from './pages/MaterialsPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import { Page, Question } from './types';

function AppRouter() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [practiceQuestions, setPracticeQuestions] = useState<Question[]>([]);
  const [practiceSubjectId, setPracticeSubjectId] = useState<string>('');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  function startPractice(subjectId: string, questions: Question[]) {
    setPracticeSubjectId(subjectId);
    setPracticeQuestions(questions);
    setPage('practice-question');
  }

  switch (page) {
    case 'home':
      return <HomePage currentPage={page} onNavigate={setPage} />;
    case 'practice-list':
      return <PracticeListPage currentPage={page} onNavigate={setPage} onStartPractice={startPractice} />;
    case 'practice-question':
      return (
        <PracticeQuestionPage
          currentPage={page}
          onNavigate={setPage}
          questions={practiceQuestions}
          subjectId={practiceSubjectId}
        />
      );
    case 'mock-exam':
      return <MockExamPage currentPage={page} onNavigate={setPage} />;
    case 'battle':
      return <BattlePage currentPage={page} onNavigate={setPage} />;
    case 'ai-chat':
      return <AIChatPage currentPage={page} onNavigate={setPage} />;
    case 'materials':
      return <MaterialsPage currentPage={page} onNavigate={setPage} />;
    case 'settings':
      return <SettingsPage currentPage={page} onNavigate={setPage} />;
    case 'admin':
      return <AdminPage currentPage={page} onNavigate={setPage} />;
    default:
      return <HomePage currentPage="home" onNavigate={setPage} />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
