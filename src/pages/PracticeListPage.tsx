import { useState, useEffect } from 'react';
import {
  PieChart,
  CheckCircle2,
  LayoutGrid,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Play,
  TrendingUp,
} from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Question, Page } from '../types';

interface PracticeListPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onStartPractice: (subjectId: string, questions: Question[]) => void;
}

type LanguageCode = 'ja' | 'en' | 'vi';

type LocalizedLabel = {
  ja: string;
  en: string;
  vi: string;
};

function getLocalizedText(label: LocalizedLabel, language: LanguageCode) {
  return label[language] ?? label.en ?? label.ja ?? '';
}

const MAIN_CATEGORIES = [
  {
    id: 'strategy',
    label: { ja: 'ストラテジ系', en: 'Strategy', vi: 'Chiến lược' },
    icon: PieChart,
    color: '#3B82F6',
    borderColor: 'border-blue-400',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-500',
    labelColor: 'text-blue-600',
    dotColor: 'bg-blue-500',
    subjectIds: ['cc000001-0000-0000-0000-000000000001'],
  },
  {
    id: 'management',
    label: { ja: 'マネジメント系', en: 'Management', vi: 'Quản lý' },
    icon: CheckCircle2,
    color: '#10B981',
    borderColor: 'border-emerald-400',
    bgColor: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    labelColor: 'text-emerald-600',
    dotColor: 'bg-emerald-500',
    subjectIds: ['cc000002-0000-0000-0000-000000000001'],
  },
  {
    id: 'technology',
    label: { ja: 'テクノロジ系', en: 'Technology', vi: 'Công nghệ' },
    icon: LayoutGrid,
    color: '#F59E0B',
    borderColor: 'border-amber-400',
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-500',
    labelColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
    subjectIds: ['cc000003-0000-0000-0000-000000000001'],
  },
];

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
type FormatFilter = 'all' | 'multiple_choice' | 'tree';
type ModeFilter = 'all' | 'new' | 'review';

interface CategoryStats {
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  progress: number;
  accuracy: number;
}

function CategoryCard({
  category,
  stats,
  onStart,
  loading,
  language,
}: {
  category: (typeof MAIN_CATEGORIES)[0];
  stats: CategoryStats;
  onStart: () => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const Icon = category.icon;
  const categoryLabel = getLocalizedText(category.label, language);

  return (
    <button
      onClick={onStart}
      disabled={loading || stats.questionCount === 0}
      className={`flex-1 min-w-0 ${category.bgColor} border-2 ${category.borderColor} rounded-2xl p-5 text-left hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 rounded-full ${category.dotColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className={`font-bold text-base ${category.labelColor}`}>
          {categoryLabel}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {language === 'ja' ? '学習進捗' : language === 'en' ? 'Progress' : 'Tiến độ học'}{' '}
        <span className="font-semibold text-gray-700">{stats.progress}%</span>
        {' '}／{' '}
        {language === 'ja' ? '問題数' : language === 'en' ? 'Questions' : 'Số câu'}{' '}
        <span className="font-semibold text-gray-700">
          {stats.questionCount}
          {language === 'ja' ? '問' : ''}
        </span>
      </p>

      {stats.questionCount > 0 && (
        <div className="mt-2.5 h-1.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${stats.progress}%`, backgroundColor: category.color }}
          />
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-400 mt-1">
          {language === 'ja' ? '読み込み中...' : language === 'en' ? 'Loading...' : 'Đang tải...'}
        </p>
      )}
    </button>
  );
}

function ReviewCard({
  count,
  onStart,
  language,
}: {
  count: number;
  onStart: () => void;
  language: LanguageCode;
}) {
  return (
    <button
      onClick={onStart}
      disabled={count === 0}
      className="flex-1 min-w-0 bg-purple-50 border-2 border-purple-300 rounded-2xl p-5 text-left hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-base text-purple-600">
          {language === 'ja' ? '間違い問題から復習' : language === 'en' ? 'Review mistakes' : 'Ôn lại câu sai'}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {language === 'ja' ? '未復習' : language === 'en' ? 'Not reviewed' : 'Chưa ôn'}{' '}
        <span className="font-semibold text-gray-700">
          {count}
          {language === 'ja' ? '問' : ''}
        </span>
      </p>
    </button>
  );
}

function SelectDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-36"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}：{o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

export default function PracticeListPage({
  currentPage,
  onNavigate,
  onStartPractice,
}: PracticeListPageProps) {
  const { user } = useAuth();
  const { language } = useLanguage();

  const currentLanguage = language as LanguageCode;

  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [sessionStats, setSessionStats] = useState<Record<string, { answered: number; correct: number }>>({});
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);

      const allIds = MAIN_CATEGORIES.flatMap((c) => c.subjectIds);

      const [{ data: questions }, { data: sessions }] = await Promise.all([
        supabase.from('questions').select('id, subject_id').in('subject_id', allIds),
        user
          ? supabase
              .from('practice_sessions')
              .select('subject_id, correct_answers, total_questions')
              .eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const counts: Record<string, number> = {};
      for (const id of allIds) counts[id] = 0;

      if (questions) {
        for (const q of questions) {
          counts[q.subject_id] = (counts[q.subject_id] ?? 0) + 1;
        }
      }

      setQuestionCounts(counts);

      const stats: Record<string, { answered: number; correct: number }> = {};

      if (sessions) {
        for (const s of sessions) {
          const sid = s.subject_id ?? 'all';

          if (!stats[sid]) {
            stats[sid] = { answered: 0, correct: 0 };
          }

          stats[sid].answered += s.total_questions ?? 0;
          stats[sid].correct += s.correct_answers ?? 0;
        }
      }

      setSessionStats(stats);

      if (user) {
        const { data: incorrect } = await supabase
          .from('session_answers')
          .select('id')
          .eq('is_correct', false);

        setIncorrectCount(incorrect?.length ?? 0);
      } else {
        setIncorrectCount(0);
      }

      setLoading(false);
    }

    load();
  }, [user]);

  function getCategoryStats(subjectIds: string[]): CategoryStats {
    const questionCount = subjectIds.reduce(
      (a, id) => a + (questionCounts[id] ?? 0),
      0
    );

    let answered = 0;
    let correct = 0;

    for (const id of subjectIds) {
      answered += sessionStats[id]?.answered ?? 0;
      correct += sessionStats[id]?.correct ?? 0;
    }

    const progress =
      questionCount > 0
        ? Math.min(100, Math.round((answered / questionCount) * 100))
        : 0;

    const accuracy =
      answered > 0 ? Math.round((correct / answered) * 100) : 0;

    return {
      questionCount,
      answeredCount: answered,
      correctCount: correct,
      progress,
      accuracy,
    };
  }

  async function startCategory(subjectIds: string[], key: string) {
    setStarting(key);

    let query = supabase
      .from('questions')
      .select('*, answer_choices(*)')
      .in('subject_id', subjectIds);

    if (diffFilter === 'easy') {
      query = query.eq('difficulty', 1);
    } else if (diffFilter === 'medium') {
      query = query.in('difficulty', [2, 3]);
    } else if (diffFilter === 'hard') {
      query = query.in('difficulty', [4, 5]);
    }

    if (formatFilter !== 'all') {
      query = query.eq('question_type', formatFilter);
    }

    query = query.order('question_number');

    const { data } = await query;

    if (data && data.length > 0) {
      onStartPractice(subjectIds[0], data as Question[]);
    }

    setStarting(null);
  }

  async function startReview() {
    setStarting('review');

    const { data: wrongAnswers } = await supabase
      .from('session_answers')
      .select('question_id')
      .eq('is_correct', false)
      .limit(20);

    if (!wrongAnswers || wrongAnswers.length === 0) {
      setStarting(null);
      return;
    }

    const qIds = [...new Set(wrongAnswers.map((a) => a.question_id))];

    const { data } = await supabase
      .from('questions')
      .select('*, answer_choices(*)')
      .in('id', qIds);

    if (data && data.length > 0) {
      onStartPractice('review', data as Question[]);
    }

    setStarting(null);
  }

  const summaryRows = MAIN_CATEGORIES.map((cat) => {
    const stats = getCategoryStats(cat.subjectIds);
    return { ...cat, stats };
  });

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={
        currentLanguage === 'ja'
          ? '問題演習'
          : currentLanguage === 'en'
          ? 'Practice'
          : 'Luyện tập'
      }
      subtitle={
        currentLanguage === 'ja'
          ? '学習メニュー'
          : currentLanguage === 'en'
          ? 'Study menu'
          : 'Thực đơn học tập'
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <p className="text-sm text-gray-500">
          {currentLanguage === 'ja'
            ? '分野や条件を選んで、演習を始めましょう。'
            : currentLanguage === 'en'
            ? 'Choose a subject and filters to begin practice.'
            : 'Chọn chủ đề và bộ lọc để bắt đầu luyện tập.'}
        </p>

        <div className="flex gap-4 flex-wrap">
          {MAIN_CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              stats={getCategoryStats(cat.subjectIds)}
              onStart={() => startCategory(cat.subjectIds, cat.id)}
              loading={starting === cat.id}
              language={currentLanguage}
            />
          ))}

          <ReviewCard
            count={incorrectCount}
            onStart={startReview}
            language={currentLanguage}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-600 shrink-0">
              {currentLanguage === 'ja'
                ? '条件で絞り込む'
                : currentLanguage === 'en'
                ? 'Filter by'
                : 'Lọc theo'}
            </span>

            <SelectDropdown
              label={
                currentLanguage === 'ja'
                  ? '難易度'
                  : currentLanguage === 'en'
                  ? 'Difficulty'
                  : 'Độ khó'
              }
              value={diffFilter}
              onChange={(v) => setDiffFilter(v as DifficultyFilter)}
              options={[
                {
                  value: 'all',
                  label:
                    currentLanguage === 'ja'
                      ? 'すべて'
                      : currentLanguage === 'en'
                      ? 'All'
                      : 'Tất cả',
                },
                {
                  value: 'easy',
                  label:
                    currentLanguage === 'ja'
                      ? '初級'
                      : currentLanguage === 'en'
                      ? 'Easy'
                      : 'Dễ',
                },
                {
                  value: 'medium',
                  label:
                    currentLanguage === 'ja'
                      ? '中級'
                      : currentLanguage === 'en'
                      ? 'Medium'
                      : 'Trung bình',
                },
                {
                  value: 'hard',
                  label:
                    currentLanguage === 'ja'
                      ? '上級'
                      : currentLanguage === 'en'
                      ? 'Hard'
                      : 'Khó',
                },
              ]}
            />

            <SelectDropdown
              label={
                currentLanguage === 'ja'
                  ? '出題形式'
                  : currentLanguage === 'en'
                  ? 'Question type'
                  : 'Dạng câu hỏi'
              }
              value={formatFilter}
              onChange={(v) => setFormatFilter(v as FormatFilter)}
              options={[
                {
                  value: 'all',
                  label:
                    currentLanguage === 'ja'
                      ? 'すべて'
                      : currentLanguage === 'en'
                      ? 'All'
                      : 'Tất cả',
                },
                {
                  value: 'multiple_choice',
                  label:
                    currentLanguage === 'ja'
                      ? '選択式'
                      : currentLanguage === 'en'
                      ? 'Multiple choice'
                      : 'Trắc nghiệm',
                },
                {
                  value: 'tree',
                  label:
                    currentLanguage === 'ja'
                      ? 'ツリー問題'
                      : currentLanguage === 'en'
                      ? 'Tree question'
                      : 'Câu hỏi cây',
                },
              ]}
            />

            <SelectDropdown
              label={
                currentLanguage === 'ja'
                  ? '学習モード'
                  : currentLanguage === 'en'
                  ? 'Learning mode'
                  : 'Chế độ học'
              }
              value={modeFilter}
              onChange={(v) => setModeFilter(v as ModeFilter)}
              options={[
                {
                  value: 'all',
                  label:
                    currentLanguage === 'ja'
                      ? 'すべて'
                      : currentLanguage === 'en'
                      ? 'All'
                      : 'Tất cả',
                },
                {
                  value: 'new',
                  label:
                    currentLanguage === 'ja'
                      ? '未解答'
                      : currentLanguage === 'en'
                      ? 'New'
                      : 'Chưa trả lời',
                },
                {
                  value: 'review',
                  label:
                    currentLanguage === 'ja'
                      ? '復習'
                      : currentLanguage === 'en'
                      ? 'Review'
                      : 'Ôn tập',
                },
              ]}
            />

            <button
              onClick={() =>
                startCategory(
                  MAIN_CATEGORIES.flatMap((c) => c.subjectIds),
                  'all'
                )
              }
              disabled={!!starting}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {currentLanguage === 'ja'
                ? '全分野演習'
                : currentLanguage === 'en'
                ? 'Practice all'
                : 'Luyện tất cả'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              {currentLanguage === 'ja'
                ? '分野別 学習進捗サマリー'
                : currentLanguage === 'en'
                ? 'Progress by subject'
                : 'Tiến độ theo chủ đề'}
            </h3>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-8 bg-gray-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 text-left font-semibold">
                      {currentLanguage === 'ja'
                        ? '分野'
                        : currentLanguage === 'en'
                        ? 'Subject'
                        : 'Chủ đề'}
                    </th>
                    <th className="pb-2 text-center font-semibold">
                      {currentLanguage === 'ja'
                        ? '進捗'
                        : currentLanguage === 'en'
                        ? 'Progress'
                        : 'Tiến độ'}
                    </th>
                    <th className="pb-2 text-center font-semibold">
                      {currentLanguage === 'ja'
                        ? '正答率'
                        : currentLanguage === 'en'
                        ? 'Accuracy'
                        : 'Độ chính xác'}
                    </th>
                    <th className="pb-2 text-right font-semibold">
                      {currentLanguage === 'ja'
                        ? '問題数'
                        : currentLanguage === 'en'
                        ? 'Questions'
                        : 'Số câu'}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {summaryRows.map((row) => (
                    <tr
                      key={row.id}
                      className="group hover:bg-gray-50 transition"
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${row.dotColor}`}
                          />
                          <span className="font-medium text-gray-700">
                            {getLocalizedText(row.label, currentLanguage)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 text-center">
                        <span
                          className={`font-bold ${
                            row.stats.progress >= 70
                              ? 'text-emerald-600'
                              : row.stats.progress >= 40
                              ? 'text-amber-500'
                              : 'text-gray-500'
                          }`}
                        >
                          {row.stats.progress}%
                        </span>
                      </td>

                      <td className="py-3 text-center">
                        <span
                          className={`font-bold ${
                            row.stats.accuracy >= 70
                              ? 'text-emerald-600'
                              : row.stats.accuracy >= 50
                              ? 'text-amber-500'
                              : row.stats.answeredCount === 0
                              ? 'text-gray-300'
                              : 'text-red-500'
                          }`}
                        >
                          {row.stats.answeredCount === 0
                            ? '—'
                            : `${row.stats.accuracy}%`}
                        </span>
                      </td>

                      <td className="py-3 text-right text-gray-500">
                        {row.stats.questionCount}
                        {currentLanguage === 'ja' ? '問' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-blue-500" />
              {currentLanguage === 'ja'
                ? 'おすすめの次のアクション'
                : currentLanguage === 'en'
                ? 'Recommended next actions'
                : 'Hành động tiếp theo'}
            </h3>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-semibold">
                    {currentLanguage === 'ja'
                      ? '内容'
                      : currentLanguage === 'en'
                      ? 'Item'
                      : 'Nội dung'}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {currentLanguage === 'ja'
                      ? 'アクション'
                      : currentLanguage === 'en'
                      ? 'Action'
                      : 'Hành động'}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {[...summaryRows]
                  .sort(
                    (a, b) =>
                      a.stats.accuracy - b.stats.accuracy ||
                      a.stats.progress - b.stats.progress
                  )
                  .slice(0, 2)
                  .map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition">
                      <td className="py-3">
                        <p className="font-semibold text-gray-700">
                          {getLocalizedText(row.label, currentLanguage)}
                          {currentLanguage === 'ja'
                            ? 'の基礎固め'
                            : currentLanguage === 'en'
                            ? ' fundamentals'
                            : ' nền tảng'}
                        </p>

                        <p className="text-xs text-gray-400">
                          {row.stats.answeredCount === 0
                            ? currentLanguage === 'ja'
                              ? 'まだ解いていません'
                              : currentLanguage === 'en'
                              ? 'Not attempted yet'
                              : 'Chưa giải'
                            : `${
                                currentLanguage === 'ja'
                                  ? '正答率'
                                  : currentLanguage === 'en'
                                  ? 'Accuracy'
                                  : 'Độ chính xác'
                              } ${row.stats.accuracy}%`}
                        </p>
                      </td>

                      <td className="py-3 text-right">
                        <button
                          onClick={() => startCategory(row.subjectIds, row.id)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                        >
                          {currentLanguage === 'ja'
                            ? '問題を解く'
                            : currentLanguage === 'en'
                            ? 'Solve'
                            : 'Làm bài'}
                        </button>
                      </td>
                    </tr>
                  ))}

                <tr className="hover:bg-gray-50 transition">
                  <td className="py-3">
                    <p className="font-semibold text-gray-700">
                      {currentLanguage === 'ja'
                        ? '模擬試験で実力確認'
                        : currentLanguage === 'en'
                        ? 'Check your level with a mock exam'
                        : 'Kiểm tra trình độ bằng thi thử'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {currentLanguage === 'ja'
                        ? '本番形式で時間を計って挑戦'
                        : currentLanguage === 'en'
                        ? 'Take it under real exam timing'
                        : 'Làm bài theo thời gian thi thật'}
                    </p>
                  </td>

                  <td className="py-3 text-right">
                    <button
                      onClick={() => onNavigate('mock-exam')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                    >
                      {currentLanguage === 'ja'
                        ? '模擬試験へ'
                        : currentLanguage === 'en'
                        ? 'Go to mock exam'
                        : 'Đến thi thử'}
                    </button>
                  </td>
                </tr>

                {incorrectCount > 0 && (
                  <tr className="hover:bg-gray-50 transition">
                    <td className="py-3">
                      <p className="font-semibold text-gray-700">
                        {currentLanguage === 'ja'
                          ? '間違えた問題を復習する'
                          : currentLanguage === 'en'
                          ? 'Review missed questions'
                          : 'Ôn lại câu sai'}
                      </p>

                      <p className="text-xs text-gray-400">
                        {currentLanguage === 'ja'
                          ? `${incorrectCount}問の未復習問題あり`
                          : currentLanguage === 'en'
                          ? `${incorrectCount} questions to review`
                          : `${incorrectCount} câu cần ôn`}
                      </p>
                    </td>

                    <td className="py-3 text-right">
                      <button
                        onClick={startReview}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-700 hover:underline transition"
                      >
                        {currentLanguage === 'ja'
                          ? '復習する'
                          : currentLanguage === 'en'
                          ? 'Review'
                          : 'Ôn tập'}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}