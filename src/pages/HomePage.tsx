import { translateMessage, languageLocales, translate, type Language } from '../i18n';
import { useState, useEffect } from 'react';
import { ChevronRight, ArrowRight, ChevronLeft, Layers, BarChart2, Trophy, MessageCircle, TrendingUp, CheckCircle, Clock, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { loadPracticeProgress, practiceErrorMessage, type PracticeProgressSession } from '../lib/practice';
import { supabase } from '../lib/supabase';
import { Page, PracticeSession, ExamSession } from '../types';

interface HomePageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

function CalendarWidget({ daysLeft, language, sessions = [], examTargetDate }: { daysLeft: number; language: Language; sessions?: PracticeSession[]; examTargetDate?: string | null }) {
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
  const examDate = examTargetDate ? new Date(examTargetDate) : null;
  
  const isToday = (d: number | null) =>
    d !== null &&
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === d;
    
  const isExamDay = (d: number | null) =>
    d !== null &&
    examDate &&
    examDate.getFullYear() === year &&
    examDate.getMonth() === month &&
    examDate.getDate() === d;
    
  const hasPractice = (d: number | null) =>
    d !== null && practiceDates.has(`${year}-${month}-${d}`);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 dark:bg-[rgba(255,255,255,0.055)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]">
      {/* Countdown */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-[#94A3B8]">{translate(language, 'homePage.untilExam')}</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-[#7EA2F8]">
            {translate(language, 'homePage.daysRemaining', { count: daysLeft })}
          </p>
        </div>
        <button 
          onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="h-10 rounded-full bg-blue-50 px-4 text-sm font-semibold text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition cursor-pointer dark:bg-[rgba(126,162,248,0.12)] dark:text-[#7EA2F8] dark:hover:bg-[rgba(126,162,248,0.18)]"
          title={translate(language, 'homePage.today')}
        >
          {translate(language, 'homePage.today')}
        </button>
      </div>

      {/* Calendar nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition dark:hover:bg-slate-800">
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-slate-300" />
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(viewDate)}
        </span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition dark:hover:bg-slate-800">
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-slate-300" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weekDays.map((d, index) => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 ${index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-gray-400 dark:text-slate-400'}`}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center text-xs rounded-lg transition ${
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 dark:bg-[rgba(255,255,255,0.055)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 dark:text-[#F8FAFC]">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        {translate(language, 'homePage.learningStats')}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-[#7EA2F8]">{totalPractice}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 dark:text-[#94A3B8]">{translate(language, 'homePage.practice')}</p>
        </div>
        <div className="text-center border-x border-gray-100 dark:border-[rgba(255,255,255,0.10)]">
          <p className="text-2xl font-bold text-emerald-500 dark:text-[#4CC9B0]">{accuracy}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5 dark:text-[#94A3B8]">{translate(language, 'homePage.accuracy')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-500 dark:text-[#FFB84D]">{examCount > 0 ? `${avgExamScore}%` : '—'}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 dark:text-[#94A3B8]">{translate(language, 'homePage.examAvg')}</p>
        </div>
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
    cardClass: 'bg-[linear-gradient(135deg,#EAF1FF_0%,#FFFFFF_85%)] border border-[#dfeaf9] dark:bg-[linear-gradient(135deg,rgba(126,162,248,0.16)_0%,rgba(255,255,255,0.035)_100%)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]',
    iconBg: 'bg-[#E8F0FF] dark:bg-[rgba(126,162,248,0.18)]',
    iconColor: 'text-[#4F7DF3] dark:text-[#7EA2F8]',
    arrowBg: 'bg-[#4F7DF3] dark:bg-[#7EA2F8]',
  },
  {
    page: 'mock-exam' as Page,
    icon: BarChart2,
    title: translate(language, 'homePage.mockExam'),
    description: translate(language, 'homePage.checkYourLevelWithATimedExamFormat'),
    cardClass: 'bg-[linear-gradient(135deg,#E2F8F4_0%,#FFFFFF_85%)] border border-[#dbeeea] dark:bg-[linear-gradient(135deg,rgba(76,201,176,0.16)_0%,rgba(255,255,255,0.035)_100%)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]',
    iconBg: 'bg-[#D8F4EF] dark:bg-[rgba(76,201,176,0.18)]',
    iconColor: 'text-[#18B89A] dark:text-[#4CC9B0]',
    arrowBg: 'bg-[#18B89A] dark:bg-[#4CC9B0]',
  },
  {
    page: 'battle' as Page,
    icon: Trophy,
    title: translate(language, 'homePage.battle'),
    description: translate(language, 'homePage.challengeOthersAndSharpenYourSkills'),
    cardClass: 'bg-[linear-gradient(135deg,#FFF0DD_0%,#FFFFFF_85%)] border border-[#f5e2c2] dark:bg-[linear-gradient(135deg,rgba(255,184,77,0.16)_0%,rgba(255,255,255,0.035)_100%)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]',
    iconBg: 'bg-[#FFE8CF] dark:bg-[rgba(255,184,77,0.18)]',
    iconColor: 'text-[#F5A623] dark:text-[#FFB84D]',
    arrowBg: 'bg-[#F5A623] dark:bg-[#FFB84D]',
  },
  {
    page: 'ai-chat' as Page,
    icon: MessageCircle,
    title: translate(language, 'homePage.aiChat'),
    description: translate(language, 'homePage.askAiAboutUnclearProblemsOrStudyPlans'),
    cardClass: 'bg-[linear-gradient(135deg,#EFEEFF_0%,#FFFFFF_85%)] border border-[#e7e4ff] dark:bg-[linear-gradient(135deg,rgba(170,166,248,0.16)_0%,rgba(255,255,255,0.035)_100%)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]',
    iconBg: 'bg-[#E9E9FF] dark:bg-[rgba(170,166,248,0.18)]',
    iconColor: 'text-[#A8A7F5] dark:text-[#AAA6F8]',
    arrowBg: 'bg-[#A8A7F5] dark:bg-[#AAA6F8]',
  },
  {
    page: 'materials' as Page,
    icon: FileText,
    title: translate(language, 'homePage.materials'),
    description: translate(language, 'homePage.studentsCanCheckMaterialsAnytimeMakingInformationSharing'),
    cardClass: 'bg-[linear-gradient(135deg,#EAF1FF_0%,#FFFFFF_85%)] border border-[#dfeaf9] dark:bg-[linear-gradient(135deg,rgba(126,162,248,0.14)_0%,rgba(255,255,255,0.035)_100%)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]',
    iconBg: 'bg-[#E8F0FF] dark:bg-[rgba(126,162,248,0.18)]',
    iconColor: 'text-[#4F7DF3] dark:text-[#7EA2F8]',
    arrowBg: 'bg-[#4F7DF3] dark:bg-[#7EA2F8]',
  },
  ];
}

export default function HomePage({ currentPage, onNavigate }: HomePageProps) {
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

  const recentSessions = practiceSessions.slice(0, 3);
  const guest = translate(language, 'homePage.guest');
  const greeting = translate(language, 'homePage.goodMorning');
  const features = getFeatures(language);

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={`${profile?.name ?? guest}${greeting}`}>
      <div className="app-shell">
        <div className="flex flex-col-reverse lg:flex-row gap-6">
          <div className="flex-1 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 xl:gap-6">
              {features.map(({ page, icon: Icon, title, description, cardClass, iconBg, iconColor, arrowBg }) => (
                <div
                  key={page}
                  className={`${page === 'materials' ? 'md:col-span-2' : ''} ${cardClass} rounded-2xl p-4 sm:p-5 xl:p-6 flex items-center justify-between gap-4 xl:gap-5 cursor-pointer transition-all hover:shadow-md`} 
                  onClick={() => onNavigate(page)}
                >
                  <div className="flex items-center gap-4 xl:gap-5 min-w-0">
                    <div className={`${iconBg} w-12 h-12 xl:w-14 xl:h-14 rounded-xl flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 xl:w-6 xl:h-6 ${iconColor}`} />
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-xl xl:text-[1.45rem] font-bold text-slate-950 dark:text-[#F8FAFC] leading-tight">{title}</h2>
                      <p className="text-sm xl:text-base text-slate-700 dark:text-[#CBD5E1] mt-1 max-w-lg leading-snug">{description}</p>
                    </div>
                  </div>

                  <button
                    onClick={e => { e.stopPropagation(); onNavigate(page); }}
                    aria-label={title}
                    className={`${arrowBg} w-12 h-12 xl:w-[3.25rem] xl:h-[3.25rem] rounded-xl flex items-center justify-center text-white shadow-lg shadow-black/10 transition hover:opacity-90 shrink-0`}
                  >
                    <ArrowRight className="w-5 h-5 xl:w-6 xl:h-6" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-100 dark:bg-[rgba(255,255,255,0.055)] dark:border-[rgba(255,255,255,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)] rounded-2xl p-5 sm:p-6">
              <h3 className="text-[1.05rem] font-bold text-slate-800 dark:text-[#F8FAFC] mb-5 flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-500 dark:text-[#CBD5E1]" />
                {translate(language, 'homePage.recentActivity')}
              </h3>

              {recentSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 dark:bg-[rgba(126,162,248,0.12)] dark:border-[rgba(255,255,255,0.10)] flex items-center justify-center mb-3">
                    <Layers className="w-6 h-6 text-blue-600 dark:text-[#7EA2F8]" />
                  </div>
                  <p className="text-base text-slate-500 dark:text-[#CBD5E1]">{translate(language, 'homePage.noStudyHistoryYet')}</p>
                  <button onClick={() => onNavigate('practice-list')} className="mt-4 text-blue-600 dark:text-[#7EA2F8] text-sm font-medium hover:underline">
                    {translate(language, 'homePage.startPractice2')} →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map(s => {
                    const pct = s.answered_count > 0 ? Math.round((s.correct_answers / s.answered_count) * 100) : 0;
                    return (
                      <div key={s.id} className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-[rgba(255,255,255,0.04)] dark:border-[rgba(255,255,255,0.08)]">
                        <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-[#4CC9B0] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-[#F8FAFC]">
                            {translate(language, 'homePage.practiceQuestionCount', { count: s.answered_count })}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                            {new Date(s.created_at).toLocaleDateString(languageLocales[language])}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${pct >= 70 ? 'text-emerald-600 dark:text-[#4CC9B0]' : pct >= 50 ? 'text-amber-500 dark:text-[#FFB84D]' : 'text-red-500 dark:text-[#F87171]'}`}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="w-full lg:w-72 space-y-5 shrink-0">
            <CalendarWidget daysLeft={daysLeft} language={language} sessions={practiceSessions} examTargetDate={examTargetDate} />
            {progressError && <p role="alert" className="text-sm text-red-600">{translateMessage(language, progressError)}</p>}
            <StatsCard sessions={practiceSessions} examSessions={examSessions} language={language} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
