import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { translate } from '../../../i18n';
import { useLanguage } from '../../../contexts/LanguageContext';
import { supabase } from '../../../lib/supabase';
import { calculateAccuracy } from '../../../lib/scoring';

interface StatsData {
  totalQuestions: number;
  totalSubjects: number;
  totalUsers: number;
  totalPracticeSessions: number;
  totalExamSessions: number;
  avgAccuracy: number;
}

export default function StatsTab() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');

      try {
        const [questions, subjects, users, practice, exams] = await Promise.all([
          supabase.from('questions').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('practice_sessions').select('correct_answers, total_questions'),
          supabase.from('exam_sessions').select('correct_answers, total_questions'),
        ]);

        const firstError = questions.error ?? subjects.error ?? users.error ?? practice.error ?? exams.error;
        if (firstError) throw firstError;

        const allSessions = [...(practice.data ?? []), ...(exams.data ?? [])];
        const totalQuestions = allSessions.reduce((sum, session) => sum + (session.total_questions ?? 0), 0);
        const correctAnswers = allSessions.reduce((sum, session) => sum + (session.correct_answers ?? 0), 0);

        setStats({
          totalQuestions: questions.count ?? 0,
          totalSubjects: subjects.count ?? 0,
          totalUsers: users.count ?? 0,
          totalPracticeSessions: practice.data?.length ?? 0,
          totalExamSessions: exams.data?.length ?? 0,
          avgAccuracy: calculateAccuracy(correctAnswers, totalQuestions),
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load statistics.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (error || !stats) {
    return <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{error}</div>;
  }

  const cards = [
    { label: translate(language, 'adminPage.totalQuestions'), value: stats.totalQuestions, color: 'blue', suffix: translate(language, 'adminPage.questionsSuffix') },
    { label: translate(language, 'adminPage.subjectCount'), value: stats.totalSubjects, color: 'purple', suffix: translate(language, 'adminPage.subjectsSuffix') },
    { label: translate(language, 'adminPage.userTotal'), value: stats.totalUsers, color: 'emerald', suffix: translate(language, 'adminPage.peopleSuffix') },
    { label: translate(language, 'adminPage.practiceSessions'), value: stats.totalPracticeSessions, color: 'amber', suffix: translate(language, 'adminPage.sessionsSuffix') },
    { label: translate(language, 'adminPage.mockExamSessions'), value: stats.totalExamSessions, color: 'rose', suffix: translate(language, 'adminPage.sessionsSuffix') },
    { label: translate(language, 'adminPage.overallAccuracy'), value: stats.avgAccuracy, color: 'teal', suffix: '%' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-600',
    teal: 'bg-teal-50 text-teal-600',
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
          <p className="text-xs font-semibold text-gray-400 mb-2">{card.label}</p>
          <p className={`text-2xl sm:text-4xl font-bold ${colorMap[card.color]?.split(' ')[1]}`}>
            {card.value.toLocaleString()}<span className="text-sm sm:text-lg font-medium ml-1">{card.suffix}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
