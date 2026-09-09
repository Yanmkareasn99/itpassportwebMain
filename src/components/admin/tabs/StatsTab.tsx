import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { translateMessage, translate } from '../../../i18n';
import { useLanguage } from '../../../contexts/LanguageContext';
import { supabase } from '../../../lib/supabase';
import { calculateAccuracy } from '../../../lib/scoring';
import { fetchPointSettings, updatePointSetting } from '../../../lib/points';
import { PointSetting } from '../../../types';

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
  const [pointSettings, setPointSettings] = useState<PointSetting[]>([]);
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');

      try {
        const [questions, subjects, users, practice, exams, settings] = await Promise.all([
          supabase.from('questions').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('practice_sessions').select('correct_answers, total_questions'),
          supabase.from('exam_sessions').select('correct_answers, total_questions'),
          fetchPointSettings(),
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
        setPointSettings(settings);
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

  if (!stats) {
    return <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{translateMessage(language, error)}</div>;
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

  async function handlePointSettingChange(key: string, value: number) {
    const safeValue = Math.max(0, Math.round(value));
    setPointSettings(settings => settings.map(setting =>
      setting.key === key ? { ...setting, value: safeValue } : setting,
    ));
    setSavingKey(key);
    setError('');
    try {
      await updatePointSetting(key, safeValue);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save point setting.');
    } finally {
      setSavingKey('');
    }
  }

  const settingLabels: Record<string, string> = {
    daily_login_points: translate(language, 'ui.dailyLogin'),
    practice_correct_points: translate(language, 'ui.practiceCorrect'),
    practice_wrong_points: translate(language, 'ui.practiceWrong'),
    mock_correct_points: translate(language, 'ui.mockCorrect'),
    mock_wrong_points: translate(language, 'ui.mockWrong'),
  };

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{translateMessage(language, error)}</div>}
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">{translate(language, 'ui.pointRewards')}</h3>
            <p className="text-xs text-gray-400">{translate(language, 'ui.pointHelp')}</p>
          </div>
          {savingKey && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pointSettings.map(setting => (
            <label key={setting.key} className="block rounded-xl border border-gray-100 bg-gray-50 p-3">
              <span className="text-xs font-semibold text-gray-500">{settingLabels[setting.key] ?? setting.key}</span>
              <input
                type="number"
                min={0}
                value={setting.value}
                onChange={event => void handlePointSettingChange(setting.key, Number(event.target.value))}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
