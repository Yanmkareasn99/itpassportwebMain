import { translateMessage, languageLocales, translate, type Language } from '../i18n';
import { useState, useEffect } from 'react';
import { ChevronRight, ArrowRight, ChevronLeft, Layers, BarChart2, Trophy, MessageCircle, TrendingUp, Clock, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { loadPracticeProgress, practiceErrorMessage, type PracticeProgressSession } from '../lib/practice';
import { supabase } from '../lib/supabase';
import { Page, PracticeSession, ExamSession } from '../types';
import AnnouncementBanner from '../components/AnnouncementBanner';

interface HomePageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onSetExamDate?: () => void;
}

function CalendarWidget({ daysLeft, language, sessions = [], examTargetDate, onSetExamDate }: { daysLeft: number; language: Language; sessions?: PracticeSession[]; examTargetDate?: string | null; onSetExamDate: () => void }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const locale = languageLocales[language];
  const weekDays = Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + day)),
  );

  // Get set of dates with practice sessions
  const practiceDates = new Set(
    sessions.map(s => {
      const date = new Date(s.created_at);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    })
  );

  // Parse exam target date
  const examDate = examTargetDate ? new Date(`${examTargetDate}T00:00:00`) : null;
  const examEnd = examDate
    ? new Date(
        examDate.getFullYear(),
        examDate.getMonth(),
        examDate.getDate(),
        23,
        59,
        59,
        999,
      )
    : null;
  const examHasEnded = examEnd !== null && today > examEnd;
  const needsExamDate = examDate === null || examHasEnded;
  const showExamMarker = examEnd !== null && !examHasEnded;

  const isToday = (d: number | null) =>
    d !== null &&
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === d;

  const isExamDay = (d: number | null) =>
    d !== null &&
    showExamMarker &&
    examDate !== null &&
    examDate.getFullYear() === year &&
    examDate.getMonth() === month &&
    examDate.getDate() === d;

  const hasPractice = (d: number | null) =>
    d !== null && practiceDates.has(`${year}-${month}-${d}`);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 dark:bg-[rgba(255,255,255,0.055)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]">
      {/* Countdown */}
      <div className="flex items-center justify-between mb-4">
        {!needsExamDate ? (
          <div>
            <p className="text-xs text-gray-500 dark:text-[#94A3B8]">{translate(language, 'homePage.untilExam')}</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-[#7EA2F8]">
              {translate(language, 'homePage.daysRemaining', { count: daysLeft })}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSetExamDate}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 dark:bg-[#7EA2F8] dark:text-slate-950 dark:hover:bg-blue-300"
          >
            <Clock className="h-4 w-4" />
            {translate(language, 'homePage.setExamDate')}
          </button>
        )}
        <button type="button"
          onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="ml-auto h-10 rounded-full bg-blue-50 px-4 text-sm font-semibold text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition cursor-pointer dark:bg-[rgba(126,162,248,0.12)] dark:text-[#7EA2F8] dark:hover:bg-[rgba(126,162,248,0.18)]"
          title={translate(language, 'homePage.today')}
        >
          {translate(language, 'homePage.today')}
        </button>
      </div>

      {/* Calendar nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition dark:hover:bg-slate-800">
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-slate-300" />
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(viewDate)}
        </span>
        <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition dark:hover:bg-slate-800">
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-slate-300" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d, index) => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 ${index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-gray-400 dark:text-slate-400'}`}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center text-xs rounded-full transition ${
              d === null
                ? ''
                : isToday(d)
                ? 'bg-blue-600 text-white font-bold'
                : isExamDay(d)
                ? 'bg-red-500 text-white font-bold border border-red-600 ring-2 ring-red-300'
                : hasPractice(d)
                ? 'bg-emerald-100 text-emerald-700 font-semibold border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
                : 'hover:bg-gray-50 text-gray-600 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            title={isExamDay(d) ? 'Exam Day 📝' : hasPractice(d) ? 'Practice session' : ''}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRing({ percent, display, label, colorClass, trackClass }: { percent: number; display: string; label: string; colorClass: string; trackClass: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className={`stroke-current ${trackClass}`} />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={`stroke-current ${colorClass}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-800 dark:text-[#F8FAFC]">
          {display}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-[#94A3B8]">{label}</p>
    </div>
  );
}

function StatsCard({ sessions, examSessions, language }: { sessions: PracticeProgressSession[]; examSessions: ExamSession[]; language: Language }) {
  const totalPractice = sessions.length;
  const totalCorrect = sessions.reduce((a, s) => a + s.correct_answers, 0);
  const totalQuestions = sessions.reduce((a, s) => a + s.answered_count, 0);
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const examCount = examSessions.length;
  const avgExamScore = examSessions.length > 0
    ? Math.round(examSessions.reduce((a, s) => a + (s.total_questions > 0 ? (s.correct_answers / s.total_questions) * 100 : 0), 0) / examSessions.length)
    : 0;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 dark:bg-[rgba(255,255,255,0.055)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]">
      <h3 className="text-sm font-semibold text-gray-700 mb-6 flex items-center gap-2 dark:text-[#F8FAFC]">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        {translate(language, 'homePage.learningStats')}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <StatRing
          percent={totalPractice > 0 ? 100 : 0}
          display={String(totalPractice)}
          label={translate(language, 'homePage.practice')}
          colorClass="text-blue-500 dark:text-[#7EA2F8]"
          trackClass="text-blue-100 dark:text-white/10"
        />
        <StatRing
          percent={accuracy}
          display={`${accuracy}%`}
          label={translate(language, 'homePage.accuracy')}
          colorClass="text-emerald-500 dark:text-[#4CC9B0]"
          trackClass="text-emerald-100 dark:text-white/10"
        />
        <StatRing
          percent={examCount > 0 ? avgExamScore : 0}
          display={examCount > 0 ? `${avgExamScore}%` : '—'}
          label={translate(language, 'homePage.examAvg')}
          colorClass="text-amber-500 dark:text-[#FFB84D]"
          trackClass="text-amber-100 dark:text-white/10"
        />
      </div>
    </div>
  );
}

function getFeatures(language: Language) {
  return [
    {
      page: 'practice-list' as Page,
      icon: Layers,
      title: translate(language, 'homePage.practice2'),
      description: translate(language, 'homePage.practiceBySubjectAndSteadilyImproveYourSkills'),
      cardClass: 'bg-[#F9E27D]',
      shapeClass: 'bg-[#F2C94C] [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]',
    },
    {
      page: 'mock-exam' as Page,
      icon: BarChart2,
      title: translate(language, 'homePage.mockExam'),
      description: translate(language, 'homePage.checkYourLevelWithATimedExamFormat'),
      cardClass: 'bg-[#B9C27E]',
      shapeClass: 'bg-[#8F9B4A] [clip-path:polygon(0_0,100%_0,50%_100%)]',
    },
    {
      page: 'battle' as Page,
      icon: Trophy,
      title: translate(language, 'homePage.battle'),
      description: translate(language, 'homePage.challengeOthersAndSharpenYourSkills'),
      cardClass: 'bg-[#F4B0D0]',
      shapeClass: 'bg-[#E88BB8] rounded-full',
    },
    {
      page: 'ai-chat' as Page,
      icon: MessageCircle,
      title: translate(language, 'homePage.aiChat'),
      description: translate(language, 'homePage.askAiAboutUnclearProblemsOrStudyPlans'),
      cardClass: 'bg-[#A9C0EA]',
      shapeClass: 'bg-[#7F9FD6] [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]',
    },
    {
      page: 'materials' as Page,
      icon: FileText,
      title: translate(language, 'homePage.materials'),
      description: translate(language, 'homePage.studentsCanCheckMaterialsAnytimeMakingInformationSharing'),
      cardClass: 'bg-[#F5D9C4]',
      shapeClass: 'bg-[#EBBF9F] rounded-full',
    },
  ];
}

type Pt = { x: number; y: number };

function smoothPath(pts: Pt[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const chartLabels: Record<string, { avg: string; min: string; max: string }> = {
  vi: { avg: 'TRUNG BÌNH', min: 'THẤP NHẤT', max: 'CAO NHẤT' },
  ja: { avg: '平均', min: '最低', max: '最高' },
  en: { avg: 'AVERAGE', min: 'MINIMUM', max: 'MAXIMUM' },
};

function RecentActivityChart({ sessions, language, onStart }: { sessions: PracticeProgressSession[]; language: Language; onStart: () => void }) {
  const locale = languageLocales[language];
  const labels = chartLabels[language as string] ?? chartLabels.en;

  // oldest -> newest
  const data = [...sessions]
    .slice(0, 10)
    .reverse()
    .map(s => ({
      date: new Date(s.created_at),
      pct: s.answered_count > 0 ? Math.round((s.correct_answers / s.answered_count) * 100) : 0,
    }));

  const W = 300;
  const H = 100;
  const padX = 10;
  const padTop = 10;
  const padBottom = 8;
  const n = data.length;

  const pts: Pt[] = data.map((d, i) => ({
    x: n === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (n - 1),
    y: padTop + (1 - d.pct / 100) * (H - padTop - padBottom),
  }));
  const last = pts[n - 1];

  const values = data.map(d => d.pct);
  const avg = n > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / n) : 0;
  const min = n > 0 ? Math.min(...values) : 0;
  const max = n > 0 ? Math.max(...values) : 0;

  const labelIdx = n <= 4 ? data.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(d);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.055)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]">
      <div className="relative">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-[#F8FAFC]">
          <Clock className="h-4 w-4 text-blue-500" />
          {translate(language, 'homePage.recentActivity')}
        </h3>

        {n === 0 ? (
          <div className="flex flex-col items-center py-4 text-center">
            <p className="text-sm text-gray-500 dark:text-[#CBD5E1]">{translate(language, 'homePage.noStudyHistoryYet')}</p>
            <button onClick={onStart} className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-[#7EA2F8] dark:text-slate-950 dark:hover:bg-blue-300">
              {translate(language, 'homePage.startPractice2')} →
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-5">
              <div>
                <p className="text-base font-bold leading-none text-slate-800 dark:text-[#F8FAFC]">{avg}%</p>
                <p className="mt-1 text-[9px] font-semibold tracking-wide text-gray-400 dark:text-[#94A3B8]">{labels.avg}</p>
              </div>
              <div>
                <p className="text-base font-bold leading-none text-slate-800 dark:text-[#F8FAFC]">{min}%</p>
                <p className="mt-1 text-[9px] font-semibold tracking-wide text-gray-400 dark:text-[#94A3B8]">{labels.min}</p>
              </div>
              <div>
                <p className="text-base font-bold leading-none text-slate-800 dark:text-[#F8FAFC]">{max}%</p>
                <p className="mt-1 text-[9px] font-semibold tracking-wide text-gray-400 dark:text-[#94A3B8]">{labels.max}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="relative h-16 w-full">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full text-blue-500 dark:text-[#7EA2F8]"
                  role="img"
                  aria-label={translate(language, 'homePage.recentActivity')}
                >
                  {n > 1 && (
                    <path d={smoothPath(pts)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  )}
                  <line x1={last.x} y1={last.y} x2={last.x} y2={H} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                </svg>
                <span
                  aria-hidden="true"
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-500 bg-white dark:border-[#7EA2F8] dark:bg-slate-900"
                  style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-gray-400 dark:text-[#94A3B8]">
                {labelIdx.map(i => (
                  <span key={i}>{fmt(data[i].date)}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function HomePage({ currentPage, onNavigate, onSetExamDate }: HomePageProps) {
  const { profile, user } = useAuth();
  const userId = user?.id;
  const { language } = useLanguage();
  const [practiceSessions, setPracticeSessions] = useState<PracticeProgressSession[]>([]);
  const [progressError, setProgressError] = useState('');
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [daysLeft, setDaysLeft] = useState(92);
  const [examTargetDate, setExamTargetDate] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const [progress, exams, target] = await Promise.allSettled([
          loadPracticeProgress(userId!),
          supabase.from('exam_sessions').select('*').eq('user_id', userId!)
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('exam_targets').select('target_date').eq('user_id', userId!).maybeSingle(),
        ]);
        if (cancelled) return;
        if (progress.status === 'fulfilled') {
          setPracticeSessions(progress.value);
          setProgressError('');
        } else setProgressError(practiceErrorMessage(progress.reason, 'Unable to load practice accuracy.'));
        if (exams.status === 'fulfilled' && !exams.value.error && exams.value.data) setExamSessions(exams.value.data);
        if (target.status === 'fulfilled' && target.value.data?.target_date) {
          setExamTargetDate(target.value.data.target_date);
          const diff = Math.ceil((new Date(target.value.data.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          setDaysLeft(Math.max(0, diff));
        }
      } finally { loading = false; }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); };
  }, [userId]);

  const recentSessions = practiceSessions.slice(0, 10);
  const guest = translate(language, 'homePage.guest');
  const greeting = translate(language, 'homePage.goodMorning');
  const features = getFeatures(language);
  const displayName = profile?.name ?? guest;

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title="">
      <div className="app-shell space-y-5">
        <AnnouncementBanner />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ===== MAIN ===== */}
          <div className="space-y-5 min-w-0">
            {/* Hero banner */}
            <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-r from-[#E4E6FF] to-[#EFEDFF] p-5 sm:p-6 dark:border-[rgba(255,255,255,0.10)] dark:from-[rgba(126,162,248,0.16)] dark:to-[rgba(170,166,248,0.10)]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 top-0 h-full w-1/3 rounded-l-full bg-white/40 dark:bg-white/5"
              />
              <div className="relative flex items-center gap-4">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-white/70"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-2xl font-bold text-white ring-4 ring-white/70">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <h1 className="min-w-0 truncate text-xl font-bold text-indigo-950 sm:text-2xl dark:text-[#F8FAFC]">
                  {displayName}{greeting}
                </h1>
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {features.map(({ page, icon: Icon, title, description, cardClass, shapeClass }) => (
                <button
                  type="button"
                  key={page}
                  onClick={() => onNavigate(page)}
                  className={`${cardClass} ${
                    page === 'materials' ? 'col-span-2 min-h-[120px] lg:col-span-4' : 'min-h-[180px]'
                  } group relative flex flex-col justify-between overflow-hidden rounded-3xl p-5 text-left text-slate-900 transition hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <span
                    aria-hidden="true"
                    className={`${shapeClass} pointer-events-none absolute -right-4 -top-4 h-24 w-24 opacity-70 transition group-hover:scale-110`}
                  />
                  <div className="relative min-w-0">
                    <h3 className="text-xl font-bold leading-tight">{title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-800/70">{description}</p>
                  </div>
                  <div className="relative flex items-end justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Recent activity chart */}
            <RecentActivityChart
              sessions={recentSessions}
              language={language}
              onStart={() => onNavigate('practice-list')}
            />
          </div>

          {/* ===== SIDEBAR ===== */}
          <div className="space-y-5">
            <CalendarWidget
              daysLeft={daysLeft}
              language={language}
              sessions={practiceSessions}
              examTargetDate={examTargetDate}
              onSetExamDate={onSetExamDate ?? (() => onNavigate('settings'))}
            />
            {progressError && (
              <p role="alert" className="text-sm text-red-600">
                {translateMessage(language, progressError)}
              </p>
            )}
            <StatsCard sessions={practiceSessions} examSessions={examSessions} language={language} />
          </div>
        </div>
      </div>
    </Layout>
  );
}