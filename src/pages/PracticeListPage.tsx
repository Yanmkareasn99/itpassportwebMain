import { translateMessage, translate, type Language } from '../i18n';
import { useState, useEffect } from 'react';
import {
  BookOpen,
  PieChart,
  CheckCircle2,
  LayoutGrid,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Play,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import Layout from '../components/Layout';
import { fetchPracticeQuestions, loadLatestAnswerStatus, loadPracticeSessions, practiceErrorMessage, type DifficultyFilter, type FormatFilter, type ModeFilter } from '../lib/practice';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Question, Page } from '../types';

interface PracticeListPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onStartPractice: (subjectId: string, questions: Question[]) => void | Promise<void>;
}

type LanguageCode = Language;

const MAIN_CATEGORIES = [
  {
    id: 'strategy',
    labelKey: 'practiceListPage.strategy' as const,
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
    labelKey: 'practiceListPage.management' as const,
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
    labelKey: 'practiceListPage.technology' as const,
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

const KNOWN_ADDITIONAL_SUBJECTS = [
  {
    id: 'aa000000-0000-0000-0000-000000000001',
    name: '基本情報技術者 科目A',
    color: '#3B82F6',
  },
];

type MainCategoryLabelKey = (typeof MAIN_CATEGORIES)[number]['labelKey'];

interface PracticeCategory {
  id: string;
  labelKey?: MainCategoryLabelKey;
  name?: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  labelColor: string;
  dotColor: string;
  subjectIds: string[];
}

interface CategoryStats {
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  progress: number;
  accuracy: number;
}

function getCategoryLabel(category: PracticeCategory, language: LanguageCode) {
  return category.name ?? translate(language, category.labelKey!);
}

function CategoryCard({
  category,
  stats,
  onStart,
  loading,
  language,
}: {
  category: PracticeCategory;
  stats: CategoryStats;
  onStart: () => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const Icon = category.icon;
  const categoryLabel = getCategoryLabel(category, language);

  return (
    <button
      onClick={onStart}
      disabled={loading || stats.questionCount === 0}
      className={`w-full min-w-0 ${category.bgColor} border-2 ${category.borderColor} rounded-2xl p-4 sm:p-5 text-left hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed`}
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
        {translate(language, 'practiceListPage.progress')}{' '}
        <span className="font-semibold text-gray-700">{stats.progress}%</span>
        {' '}／{' '}
        {translate(language, 'practiceListPage.questions')}{' '}
        <span className="font-semibold text-gray-700">
          {stats.questionCount}
          {translate(language, 'practiceListPage.questionCountSuffix')}
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
          {translate(language, 'practiceListPage.loading')}
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
      className="w-full min-w-0 bg-purple-50 border-2 border-purple-300 rounded-2xl p-4 sm:p-5 text-left hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-base text-purple-600">
          {translate(language, 'practiceListPage.reviewMistakes')}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {translate(language, 'practiceListPage.notReviewed')}{' '}
        <span className="font-semibold text-gray-700">
          {count}
          {translate(language, 'practiceListPage.questionCountSuffix')}
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
        aria-label={label}
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
  const [additionalCategories, setAdditionalCategories] = useState<PracticeCategory[]>([]);
  const [totalQuestionCount, setTotalQuestionCount] = useState(0);
  const [sessionStats, setSessionStats] = useState<Record<string, { answered: number; correct: number }>>({});
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [progressWarning, setProgressWarning] = useState('');

  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [filterResult, setFilterResult] = useState<{ key: string; questions: Question[]; error: string } | null>(null);
  const filterKey = JSON.stringify([user?.id, diffFilter, formatFilter, modeFilter]);
  const currentResult = filterResult?.key === filterKey ? filterResult : null;
  const matchingQuestions = currentResult?.questions ?? [];
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        let questions = await fetchPracticeQuestions(null, diffFilter, formatFilter);
        if (modeFilter !== 'all') {
          const latest = await loadLatestAnswerStatus(userId);
          questions = questions.filter(question => modeFilter === 'new'
            ? !latest.has(question.id) : latest.get(question.id) === false);
        }
        if (!cancelled) setFilterResult({ key: filterKey, questions, error: '' });
      } catch (error) {
        if (!cancelled) setFilterResult({ key: filterKey, questions: [], error: practiceErrorMessage(error, 'Unable to count matching questions.') });
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [userId, diffFilter, formatFilter, modeFilter, filterKey]);

  async function startFilteredPractice() {
    if (!user || starting || !currentResult || currentResult.error || !matchingQuestions.length) return;
    setStarting('filtered');
    setError('');
    try {
      await onStartPractice('all', matchingQuestions);
    } catch (error) {
      setError(practiceErrorMessage(error, 'Unable to start practice.'));
    } finally { setStarting(null); }
  }


  useEffect(() => {
    let cancelled = false;

    async function loadQuestionCounts() {
      setLoading(true);

      try {
        const { data: subjects, error: subjectError } = await supabase
          .from('subjects')
          .select('id, name, color')
          .order('name');

        if (subjectError) throw subjectError;

        const subjectMap = new Map(
          KNOWN_ADDITIONAL_SUBJECTS.map(subject => [subject.id, subject]),
        );
        for (const subject of subjects ?? []) {
          subjectMap.set(subject.id, subject);
        }

        const subjectIds = [
          ...new Set([
            ...MAIN_CATEGORIES.flatMap(category => category.subjectIds),
            ...subjectMap.keys(),
          ]),
        ];

        const [totalResult, ...countResults] = await Promise.all([
          supabase.from('questions').select('id', { count: 'exact', head: true }),
          ...subjectIds.map(subjectId =>
            supabase
              .from('questions')
              .select('id', { count: 'exact', head: true })
              .eq('subject_id', subjectId),
          ),
        ]);

        const counts: Record<string, number> = {};
        countResults.forEach((result, index) => {
          if (result.error) {
            throw new Error(`Unable to count questions for ${subjectIds[index]}: ${result.error.message}`);
          }
          counts[subjectIds[index]] = result.count ?? 0;
        });

        if (cancelled) return;

        setQuestionCounts(counts);
        setTotalQuestionCount(
          totalResult.count ?? Object.values(counts).reduce((sum, count) => sum + count, 0),
        );

        const mainSubjectIds = new Set(MAIN_CATEGORIES.flatMap(category => category.subjectIds));
        setAdditionalCategories([...subjectMap.values()]
          .filter(subject => !mainSubjectIds.has(subject.id) && (counts[subject.id] ?? 0) > 0)
          .map(subject => ({
            id: `subject-${subject.id}`,
            name: subject.name,
            icon: BookOpen,
            color: subject.color || '#8B5CF6',
            borderColor: 'border-violet-400',
            bgColor: 'bg-violet-50',
            iconColor: 'text-violet-500',
            labelColor: 'text-violet-600',
            dotColor: 'bg-violet-500',
            subjectIds: [subject.id],
          })));
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load practice subjects.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadUserStats() {
      setProgressWarning('');
      if (!user) {
        if (!cancelled) {
          setSessionStats({});
          setIncorrectCount(0);
        }
        return;
      }

      try {
        const sessions = await loadPracticeSessions(user.id);
        const stats: Record<string, { answered: number; correct: number }> = {};
        for (const session of sessions ?? []) {
          if (!session.completed_at) continue;
          const subjectId = session.subject_id ?? 'all';
          stats[subjectId] ??= { answered: 0, correct: 0 };
          stats[subjectId].answered += session.total_questions ?? 0;
          stats[subjectId].correct += session.correct_answers ?? 0;
        }

        if (cancelled) return;

        setSessionStats(stats);
        // Preserve completed-session progress even if answer history fails.
        const latestAnswers = await loadLatestAnswerStatus(user.id, sessions);
        if (!cancelled) setIncorrectCount([...latestAnswers.values()].filter(isCorrect => !isCorrect).length);
      } catch (error) {
        if (!cancelled) {
          setIncorrectCount(0);
          setProgressWarning(practiceErrorMessage(error, 'Unable to load practice progress.'));
        }
      }
    }

    void loadQuestionCounts();
    void loadUserStats();

    return () => {
      cancelled = true;
    };
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

  async function startCategory(subjectIds: string[] | null, key: string) {
    if (!user || starting) return;
    setStarting(key);
    setError('');

    try {
      let selectedQuestions = await fetchPracticeQuestions(subjectIds, key === 'all' ? 'all' : diffFilter, key === 'all' ? 'all' : formatFilter);

      if (key !== 'all' && modeFilter !== 'all') {
        const latestAnswers = await loadLatestAnswerStatus(user!.id);
        selectedQuestions = selectedQuestions.filter(question => modeFilter === 'new'
          ? !latestAnswers.has(question.id)
          : latestAnswers.get(question.id) === false);
      }

      if (selectedQuestions.length > 0) {
        await onStartPractice(!subjectIds || subjectIds.length > 1 ? 'all' : subjectIds[0], selectedQuestions);
      } else {
        setError('No questions match these filters. Try another difficulty, question type, or learning mode.');
      }
    } catch (error) {
      setError(practiceErrorMessage(error, 'Unable to start practice.'));
    } finally {
      setStarting(null);
    }
  }

  async function startReview() {
    if (!user || starting) return;
    setStarting('review');
    setError('');

    try {
      const latestAnswers = await loadLatestAnswerStatus(user!.id);
      const qIds = [...latestAnswers.entries()]
        .filter(([, isCorrect]) => !isCorrect)
        .map(([questionId]) => questionId)
        .slice(0, 20);

      if (qIds.length === 0) {
        setError('No mistakes are waiting for review.');
        return;
      }

      const { data, error: questionsError } = await supabase
        .from('questions')
        .select('*, answer_choices(*)')
        .in('id', qIds);

      if (questionsError) throw questionsError;

      if (data && data.length > 0) {
        await onStartPractice('review', data as Question[]);
      }
    } catch (reviewError) {
      setError(practiceErrorMessage(reviewError, 'Unable to start review.'));
    } finally {
      setStarting(null);
    }
  }

  const categories: PracticeCategory[] = [...MAIN_CATEGORIES, ...additionalCategories];

  const summaryRows = categories.map((cat) => {
    const stats = getCategoryStats(cat.subjectIds);
    return { ...cat, stats };
  });

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={
        translate(currentLanguage, 'practiceListPage.practice')
      }
      subtitle={
        translate(currentLanguage, 'practiceListPage.studyMenu')
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <p className="text-sm text-gray-500">
          {translate(currentLanguage, 'practiceListPage.chooseASubjectAndFiltersToBeginPractice')}
        </p>
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
            {error}
          </div>
        )}
        {progressWarning && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
            {translate(language, 'ui.progressWarning', { error: translateMessage(language, progressWarning) })}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              stats={getCategoryStats(cat.subjectIds)}
              onStart={() => startCategory(cat.subjectIds, cat.id)}
              loading={loading || !!starting}
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
              {translate(currentLanguage, 'practiceListPage.filterBy')}
            </span>

            <SelectDropdown
              label={
                translate(currentLanguage, 'practiceListPage.difficulty')
              }
              value={diffFilter}
              onChange={(v) => { setDiffFilter(v as DifficultyFilter); setError(''); }}
              options={[
                {
                  value: 'all',
                  label:
                    translate(currentLanguage, 'practiceListPage.all'),
                },
                {
                  value: 'easy',
                  label:
                    translate(currentLanguage, 'practiceListPage.easy'),
                },
                {
                  value: 'medium',
                  label:
                    translate(currentLanguage, 'practiceListPage.medium'),
                },
                {
                  value: 'hard',
                  label:
                    translate(currentLanguage, 'practiceListPage.hard'),
                },
              ]}
            />

            <SelectDropdown
              label={
                translate(currentLanguage, 'practiceListPage.questionType')
              }
              value={formatFilter}
              onChange={(v) => { setFormatFilter(v as FormatFilter); setError(''); }}
              options={[
                {
                  value: 'all',
                  label:
                    translate(currentLanguage, 'practiceListPage.all'),
                },
                {
                  value: 'multiple_choice',
                  label:
                    translate(currentLanguage, 'practiceListPage.multipleChoice'),
                },
                {
                  value: 'tree',
                  label:
                    translate(currentLanguage, 'practiceListPage.treeQuestion'),
                },
              ]}
            />

            <SelectDropdown
              label={
                translate(currentLanguage, 'practiceListPage.learningMode')
              }
              value={modeFilter}
              onChange={(v) => { setModeFilter(v as ModeFilter); setError(''); }}
              options={[
                {
                  value: 'all',
                  label:
                    translate(currentLanguage, 'practiceListPage.all'),
                },
                {
                  value: 'new',
                  label:
                    translate(currentLanguage, 'practiceListPage.new'),
                },
                {
                  value: 'review',
                  label:
                    translate(currentLanguage, 'practiceListPage.review'),
                },
              ]}
            />

            <button
              onClick={() =>
                startCategory(null, 'all')
              }
              disabled={!!starting}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {translate(currentLanguage, 'practiceListPage.practiceAll')}
              {!loading && ` (${totalQuestionCount.toLocaleString()})`}
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" className="text-sm font-medium text-gray-600">
              {!currentResult
                ? translate(currentLanguage, 'practiceListPage.countingMatches')
                : currentResult.error
                  ? translateMessage(language, currentResult.error)
                  : translate(currentLanguage, 'practiceListPage.matchingQuestions', { count: matchingQuestions.length.toLocaleString() })}
            </p>
            <button onClick={() => void startFilteredPractice()}
              disabled={!!starting || !currentResult || !!currentResult.error || matchingQuestions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
              <Play className="w-3.5 h-3.5" />
              {translate(currentLanguage, 'practiceListPage.practiceFiltered')}
              {currentResult && !currentResult.error && ` (${matchingQuestions.length.toLocaleString()})`}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              {translate(currentLanguage, 'practiceListPage.progressBySubject')}
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
              <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 text-left font-semibold">
                      {translate(currentLanguage, 'practiceListPage.subject')}
                    </th>
                    <th className="pb-2 text-center font-semibold">
                      {translate(currentLanguage, 'practiceListPage.progress2')}
                    </th>
                    <th className="pb-2 text-center font-semibold">
                      {translate(currentLanguage, 'practiceListPage.accuracy')}
                    </th>
                    <th className="pb-2 text-right font-semibold">
                      {translate(currentLanguage, 'practiceListPage.questions')}
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
                            {getCategoryLabel(row, currentLanguage)}
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
                        {translate(currentLanguage, 'practiceListPage.questionCountSuffix')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-blue-500" />
              {translate(currentLanguage, 'practiceListPage.recommendedNextActions')}
            </h3>

            <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-semibold">
                    {translate(currentLanguage, 'practiceListPage.item')}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {translate(currentLanguage, 'practiceListPage.action')}
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
                          {getCategoryLabel(row, currentLanguage)}
                          {translate(currentLanguage, 'practiceListPage.fundamentals')}
                        </p>

                        <p className="text-xs text-gray-400">
                          {row.stats.answeredCount === 0
                            ? translate(currentLanguage, 'practiceListPage.notAttemptedYet')
                            : `${
                                translate(currentLanguage, 'practiceListPage.accuracy')
                              } ${row.stats.accuracy}%`}
                        </p>
                      </td>

                      <td className="py-3 text-right">
                        <button
                          onClick={() => startCategory(row.subjectIds, row.id)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                        >
                          {translate(currentLanguage, 'practiceListPage.solve')}
                        </button>
                      </td>
                    </tr>
                  ))}

                <tr className="hover:bg-gray-50 transition">
                  <td className="py-3">
                    <p className="font-semibold text-gray-700">
                      {translate(currentLanguage, 'practiceListPage.checkYourLevelWithAMockExam')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {translate(currentLanguage, 'practiceListPage.takeItUnderRealExamTiming')}
                    </p>
                  </td>

                  <td className="py-3 text-right">
                    <button
                      onClick={() => onNavigate('mock-exam')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                    >
                      {translate(currentLanguage, 'practiceListPage.goToMockExam')}
                    </button>
                  </td>
                </tr>

                {incorrectCount > 0 && (
                  <tr className="hover:bg-gray-50 transition">
                    <td className="py-3">
                      <p className="font-semibold text-gray-700">
                        {translate(currentLanguage, 'practiceListPage.reviewMissedQuestions')}
                      </p>

                      <p className="text-xs text-gray-400">
                        {translate(currentLanguage, 'practiceListPage.unreviewedCount', { count: incorrectCount })}
                      </p>
                    </td>

                    <td className="py-3 text-right">
                      <button
                        onClick={startReview}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-700 hover:underline transition"
                      >
                        {translate(currentLanguage, 'practiceListPage.review2')}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
