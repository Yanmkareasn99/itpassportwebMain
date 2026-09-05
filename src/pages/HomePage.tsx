import { languageLocales, translate, type Language } from '../i18n';
import { useState, useEffect } from 'react';
import { ChevronRight, ArrowRight, ChevronLeft, Target, Layers, BarChart2, Trophy, MessageCircle, TrendingUp, CheckCircle, Clock, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Countdown */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500">{translate(language, 'homePage.untilExam')}</p>
          <p className="text-3xl font-bold text-blue-600">
            {translate(language, 'homePage.daysRemaining', { count: daysLeft })}
          </p>
        </div>
        <button 
          onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 active:bg-blue-200 transition cursor-pointer"
          title="Go to current date"
        >
          <Target className="w-6 h-6 text-blue-500" />
        </button>
      </div>

      {/* Calendar nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition">
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(viewDate)}
        </span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 -m-1 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition">
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weekDays.map((d, index) => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 ${index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
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
                ? 'bg-emerald-100 text-emerald-700 font-semibold border border-emerald-300'
                : 'hover:bg-gray-50 text-gray-600 cursor-pointer'
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

function StatsCard({ sessions, examSessions, language }: { sessions: PracticeSession[]; examSessions: ExamSession[]; language: Language }) {
  const totalPractice = sessions.length;
  const totalCorrect = sessions.reduce((a, s) => a + s.correct_answers, 0);
  const totalQuestions = sessions.reduce((a, s) => a + s.total_questions, 0);
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const examCount = examSessions.length;
  const avgExamScore = examSessions.length > 0
    ? Math.round(examSessions.reduce((a, s) => a + (s.total_questions > 0 ? (s.correct_answers / s.total_questions) * 100 : 0), 0) / examSessions.length)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        {translate(language, 'homePage.learningStats')}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{totalPractice}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{translate(language, 'homePage.practice')}</p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-2xl font-bold text-emerald-500">{accuracy}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{translate(language, 'homePage.accuracy')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-500">{examCount > 0 ? `${avgExamScore}%` : '—'}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{translate(language, 'homePage.examAvg')}</p>
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
    color: 'blue',
    title: translate(language, 'homePage.practice2'),
    description: translate(language, 'homePage.practiceBySubjectAndSteadilyImproveYourSkills'),
    cta: translate(language, 'homePage.startPractice'),
    bgClass: 'from-blue-50 to-blue-100/50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    ctaClass: 'bg-blue-600 hover:bg-blue-700',
    badgeClass: 'bg-blue-100 text-blue-600',
  },
  {
    page: 'mock-exam' as Page,
    icon: BarChart2,
    color: 'emerald',
    title: translate(language, 'homePage.mockExam'),
    description: translate(language, 'homePage.checkYourLevelWithATimedExamFormat'),
    cta: translate(language, 'homePage.takeExam'),
    bgClass: 'from-emerald-50 to-emerald-100/50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    ctaClass: 'bg-emerald-600 hover:bg-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-600',
  },
  {
    page: 'battle' as Page,
    icon: Trophy,
    color: 'amber',
    title: translate(language, 'homePage.battle'),
    description: translate(language, 'homePage.challengeOthersAndSharpenYourSkills'),
    cta: translate(language, 'homePage.startBattle'),
    bgClass: 'from-amber-50 to-amber-100/50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    ctaClass: 'bg-amber-500 hover:bg-amber-600',
    badgeClass: 'bg-amber-100 text-amber-600',
  },
  {
    page: 'ai-chat' as Page,
    icon: MessageCircle,
    color: 'violet',
    title: translate(language, 'homePage.aiChat'),
    description: translate(language, 'homePage.askAiAboutUnclearProblemsOrStudyPlans'),
    cta: translate(language, 'homePage.askAi'),
    bgClass: 'from-violet-50 to-fuchsia-100/50',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    ctaClass: 'bg-violet-600 hover:bg-violet-700',
    badgeClass: 'bg-violet-100 text-violet-600',
  },
  {
    page: 'materials' as Page,
    icon: FileText,
    color: 'sky',
    title: translate(language, 'homePage.materials'),
    description: translate(language, 'homePage.studentsCanCheckMaterialsAnytimeMakingInformationSharing'),
    cta: translate(language, 'homePage.viewMaterials'),
    bgClass: 'from-sky-50 to-cyan-100/50',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    ctaClass: 'bg-sky-600 hover:bg-sky-700',
    badgeClass: 'bg-sky-100 text-sky-600',
  },
  ];
}

export default function HomePage({ currentPage, onNavigate }: HomePageProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [daysLeft, setDaysLeft] = useState(92);
  const [examTargetDate, setExamTargetDate] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: ps }, { data: es }] = await Promise.all([
        supabase.from('practice_sessions').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('exam_sessions').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      if (ps) setPracticeSessions(ps);
      if (es) setExamSessions(es);

      const { data: target } = await supabase.from('exam_targets').select('target_date').maybeSingle();
      if (target?.target_date) {
        setExamTargetDate(target.target_date);
        const diff = Math.ceil((new Date(target.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        setDaysLeft(Math.max(0, diff));
      }
    }
    load();
  }, []);

  const recentSessions = practiceSessions.slice(0, 3);
  const guest = translate(language, 'homePage.guest');
  const greeting = translate(language, 'homePage.goodMorning');
  const features = getFeatures(language);

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={`${profile?.name ?? guest}${greeting}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col-reverse lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 space-y-5">
            {/* Feature cards */}
            {features.map(({ page, icon: Icon, title, description, cta, bgClass, iconBg, iconColor, ctaClass }) => (
              <div
                key={page}
                className={`bg-gradient-to-r ${bgClass} rounded-2xl border border-gray-100 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer hover:shadow-md transition-all`}
                onClick={() => onNavigate(page)}
              >
                <div className="flex items-start sm:items-center gap-3 sm:gap-5">
                  <div className={`w-11 h-11 sm:w-14 sm:h-14 shrink-0 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-5 h-5 sm:w-7 sm:h-7 ${iconColor}`} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-800">{title}</h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 max-w-md">{description}</p>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onNavigate(page); }}
                  className={`${ctaClass} text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto`}
                >
                  {cta}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Recent activity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                {translate(language, 'homePage.recentActivity')}
              </h3>
              {recentSessions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Layers className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-400">{translate(language, 'homePage.noStudyHistoryYet')}</p>
                  <button onClick={() => onNavigate('practice-list')} className="mt-3 text-blue-600 text-xs font-medium hover:underline">
                    {translate(language, 'homePage.startPractice2')} →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map(s => {
                    const pct = s.total_questions > 0 ? Math.round((s.correct_answers / s.total_questions) * 100) : 0;
                    return (
                      <div key={s.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">
                            {translate(language, 'homePage.practiceQuestionCount', { count: s.total_questions })}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(s.created_at).toLocaleDateString(languageLocales[language])}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="w-full lg:w-72 space-y-5 shrink-0">
            <CalendarWidget daysLeft={daysLeft} language={language} sessions={practiceSessions} examTargetDate={examTargetDate} />
            <StatsCard sessions={practiceSessions} examSessions={examSessions} language={language} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
