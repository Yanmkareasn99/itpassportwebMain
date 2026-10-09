import { translateMessage, translate } from '../i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, BarChart2, Flag, GraduationCap, HelpCircle, List, Sparkles, X } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { DEFAULT_MOCK_EXAM_SETTINGS, fetchMockExamSettings, hasPassedMockExam, type MockExamSettings } from '../lib/mockExamSettings';
import { awardLocalAnswerPoints } from '../lib/points';
import { Question, AnswerChoice, Page } from '../types';
import { AnswerChoiceContent, QuestionImage } from '../components/QuestionMedia';
import { createAnswerChoiceOrders, getRandomizeAnswerChoicesPreference, shuffleItems } from '../lib/questionRandomization';

interface MockExamPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

type ReviewMark = 'red' | 'yellow' | 'green';

const REVIEW_MARK_STYLES: Record<ReviewMark, string> = {
  red: 'bg-red-500 text-white hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-400',
  yellow: 'bg-amber-300 text-amber-950 hover:bg-amber-400 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200',
  green: 'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400',
};

/* ---------- Shared style tokens (same look as the home page) ---------- */
const CARD =
  'rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.055)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]';
const BANNER =
  'relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-r from-[#E4E6FF] to-[#EFEDFF] dark:border-[rgba(255,255,255,0.10)] dark:from-[rgba(126,162,248,0.16)] dark:to-[rgba(170,166,248,0.10)]';
const HERO_BANNER =
  'relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-[#E9E6FF] via-[#F0EEFF] to-[#FAFAFF] dark:border-[rgba(255,255,255,0.10)] dark:from-[rgba(126,162,248,0.16)] dark:via-[rgba(170,166,248,0.10)] dark:to-[rgba(170,166,248,0.04)]';
const BTN_PRIMARY =
  'bg-indigo-500 text-white hover:bg-indigo-600 dark:bg-[#7EA2F8] dark:text-slate-950 dark:hover:bg-blue-300';
const BTN_SUCCESS =
  'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-[#4CC9B0] dark:text-slate-950 dark:hover:bg-emerald-300';
const BTN_SECONDARY =
  'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-[rgba(255,255,255,0.06)] dark:text-[#F8FAFC] dark:border-[rgba(255,255,255,0.10)] dark:hover:bg-[rgba(255,255,255,0.10)]';
const BTN_GHOST =
  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-[rgba(255,255,255,0.08)] dark:text-[#F8FAFC] dark:hover:bg-[rgba(255,255,255,0.12)]';

function ResultRing({
  percent,
  display,
  colorClass,
  trackClass,
}: {
  percent: number;
  display: string;
  colorClass: string;
  trackClass: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <div className="relative mx-auto h-32 w-32">
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
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-slate-800 dark:text-[#F8FAFC]">
        {display}
      </span>
    </div>
  );
}

export default function MockExamPage({ currentPage, onNavigate }: MockExamPageProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [settings, setSettings] = useState<MockExamSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState('');
  const examDuration = (settings?.duration_minutes ?? DEFAULT_MOCK_EXAM_SETTINGS.duration_minutes) * 60;
  const [stage, setStage] = useState<'intro' | 'exam' | 'result'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(DEFAULT_MOCK_EXAM_SETTINGS.duration_minutes * 60);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Page | null>(null);
  const [reviewMarks, setReviewMarks] = useState<Record<string, ReviewMark>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);
  const questionCardRef = useRef<HTMLDivElement | null>(null);
  const questionListRef = useRef<HTMLDivElement | null>(null);
  const [mobileQuestionListOpen, setMobileQuestionListOpen] = useState(false);
  const [randomizeAnswerChoices] = useState(getRandomizeAnswerChoicesPreference);
  const answerChoiceOrders = useMemo(
    () => createAnswerChoiceOrders(questions, randomizeAnswerChoices),
    [questions, randomizeAnswerChoices],
  );

  useEffect(() => {
    if (stage !== 'intro') return;
    let cancelled = false;
    setSettingsLoading(true);
    fetchMockExamSettings().then(value => {
      if (!cancelled) { setSettings(value); setError(''); }
    }).catch(() => {
      if (!cancelled) setError('Unable to load exam settings. Please try starting the exam again.');
    }).finally(() => { if (!cancelled) setSettingsLoading(false); });
    return () => { cancelled = true; };
  }, [stage]);

  async function startExam() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const config = await fetchMockExamSettings();
      const { data, error: questionError } = await supabase
        .from('questions').select('*, answer_choices(*)').order('question_number');
      if (questionError) throw questionError;
      if (!data || data.length < config.question_count) {
        throw new Error(`This exam requires ${config.question_count} questions, but only ${data?.length ?? 0} are available. Please ask an administrator to add questions or reduce the exam question count.`);
      }
      const selected = shuffleItems(data).slice(0, config.question_count) as Question[];
      let newSessionId: string | null = null;
      if (user) {
        const { data: session, error: sessionError } = await supabase.from('exam_sessions')
          .insert({ user_id: user.id, total_questions: selected.length,
            allowed_time_seconds: config.duration_minutes * 60, passing_score_percent: config.passing_score_percent })
          .select().single();
        if (sessionError) throw sessionError;
        newSessionId = session.id;
      }
      setSettings(config);
      setQuestions(selected);
      finishingRef.current = false;
      setUserAnswers({});
      setReviewMarks({});
      setShowConfirm(false);
      setPendingNavigation(null);
      setMobileQuestionListOpen(false);
      setCurrentIndex(0);
      setTimeLeft(config.duration_minutes * 60);
      setSessionId(newSessionId);
      setStage('exam');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start the exam. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const finishExam = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setShowConfirm(false);
    setPendingNavigation(null);
    const timeTaken = examDuration - timeLeft;
    let correct = 0;
    for (const q of questions) {
      const chosen = userAnswers[q.id];
      const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
      if (chosen && choices.find(c => c.id === chosen)?.is_correct) correct++;
    }
    if (sessionId) {
      const { error: updateError } = await supabase.from('exam_sessions').update({
        correct_answers: correct,
        time_taken_seconds: timeTaken,
        completed_at: new Date().toISOString(),
      }).eq('id', sessionId);
      if (updateError) console.error('Failed to save exam result:', updateError.message);

      const answerRows: {
        exam_session_id: string;
        question_id: string;
        selected_choice_id: string;
        is_correct: boolean;
      }[] = [];
      for (const q of questions) {
        const chosen = userAnswers[q.id];
        if (!chosen) continue;
        const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
        const isCorrect = choices.find(c => c.id === chosen)?.is_correct ?? false;
        if (user) await awardLocalAnswerPoints(user.id, isCorrect, 'mock');
        answerRows.push({
          exam_session_id: sessionId,
          question_id: q.id,
          selected_choice_id: chosen,
          is_correct: isCorrect,
        });
      }
      // Lưu tất cả câu trả lời bằng 1 request thay vì insert từng câu
      if (answerRows.length > 0) {
        const { error: answerError } = await supabase.from('exam_answers').insert(answerRows);
        if (answerError) console.error('Failed to save exam answers:', answerError.message);
      }
    }
    setStage('result');
  }, [examDuration, questions, sessionId, timeLeft, user, userAnswers]);

  useEffect(() => {
    if (stage !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(value => Math.max(0, value - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  useEffect(() => {
    if (stage === 'exam' && timeLeft === 0) void finishExam();
  }, [finishExam, stage, timeLeft]);

  function handleNavigate(nextPage: Page) {
    if (stage === 'exam' && nextPage !== 'mock-exam') {
      setPendingNavigation(nextPage);
      return;
    }
    onNavigate(nextPage);
  }

  function cancelLeaveExam() {
    setPendingNavigation(null);
  }

  function confirmLeaveExam() {
    if (!pendingNavigation) return;
    setPendingNavigation(null);
    setMobileQuestionListOpen(false);
    void finishExam();
  }

  // Khi mở danh sách câu hỏi (mobile) thì cuộn xuống để hiển thị
  useEffect(() => {
    if (!mobileQuestionListOpen) return;
    questionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mobileQuestionListOpen]);

  useEffect(() => {
    if (!mobileQuestionListOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && questionListRef.current?.contains(target)) return;
      setMobileQuestionListOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileQuestionListOpen]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const question = questions[currentIndex];
  const choices: AnswerChoice[] = question ? answerChoiceOrders.get(question.id) ?? [] : [];
  const answeredCount = Object.keys(userAnswers).length;
  const timeWarning = timeLeft < 600;
  const unansweredCount = questions.length - answeredCount;

  // Bấm nộp bài: nếu còn câu chưa trả lời thì hỏi xác nhận trước
  function requestFinish() {
    if (unansweredCount > 0) {
      setShowConfirm(true);
    } else {
      void finishExam();
    }
  }

  function selectQuestion(index: number) {
    setCurrentIndex(index);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      // Chọn câu xong thì ẩn danh sách và cuộn lên câu hỏi
      setMobileQuestionListOpen(false);
      questionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function toggleQuestionList() {
    setMobileQuestionListOpen(open => !open);
  }

  function changeReviewMark(mark: ReviewMark | null) {
    if (!question) return;
    setReviewMarks(current => {
      if (mark !== null && current[question.id] !== mark) {
        return { ...current, [question.id]: mark };
      }
      const next = { ...current };
      delete next[question.id];
      return next;
    });
  }

  /* ============================ INTRO ============================ */
  if (stage === 'intro') {
    return (
      <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.studyMenu')}>
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Banner */}
          <div className={`${HERO_BANNER} p-6 sm:p-8`}>
            <GraduationCap
              aria-hidden="true"
              strokeWidth={3}
              className="pointer-events-none absolute -right-8 -top-6 h-52 w-52 rotate-[18deg] text-indigo-300/30 sm:-right-4 sm:h-64 sm:w-64 dark:text-white/10"
            />
            <Sparkles
              aria-hidden="true"
              strokeWidth={1.75}
              className="pointer-events-none absolute right-5 top-5 h-6 w-6 text-violet-400 dark:text-[#AAA6F8]"
            />
            <div className="relative">
              <h2 className="flex items-center gap-3 text-2xl font-extrabold uppercase tracking-tight text-indigo-600 sm:text-3xl dark:text-[#7EA2F8]">
                <BarChart2 className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" strokeWidth={2.2} />
                {translate(language, 'mockExamPage.mockExam')}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-[#CBD5E1]">
                {translate(language, 'mockExamPage.checkYourAbilityInTheSameFormatAs')}
              </p>
              {/* Notice inside the banner */}
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 dark:border-amber-400/30 dark:bg-amber-500/10">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />
                <p className="text-sm leading-6 text-amber-700 dark:text-amber-100">
                  {translate(language, 'mockExamPage.youCannotPauseTheExamOnceItStarts')}
                </p>
              </div>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="relative overflow-hidden rounded-3xl bg-[#A9C0EA] px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
              <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 bg-[#7F9FD6] opacity-70 [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]" />
              <HelpCircle aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute -bottom-3 -right-2 h-16 w-16 text-white/40 sm:h-20 sm:w-20" />
              <div className="relative">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 sm:mb-3 sm:h-10 sm:w-10">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <p className="text-2xl font-bold leading-none sm:text-3xl">{settings?.question_count ?? '—'}</p>
                <p className="mt-1 text-[10px] leading-tight text-slate-800/70 sm:text-sm">{translate(language, 'mockExamPage.questions')}</p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-[#F9E27D] px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
              <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 bg-[#F2C94C] opacity-70 [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]" />
              <div className="relative">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 sm:mb-3 sm:h-10 sm:w-10">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <p className="text-2xl font-bold leading-none sm:text-3xl">{settings?.duration_minutes ?? '—'}</p>
                <p className="mt-1 text-[10px] leading-tight text-slate-800/70 sm:text-sm">{translate(language, 'mockExamPage.timeLimitMin')}</p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-[#B9C27E] px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
              <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 bg-[#8F9B4A] opacity-70 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
              <div className="relative">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 sm:mb-3 sm:h-10 sm:w-10">
                  <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <p className="text-2xl font-bold leading-none sm:text-3xl">{settings ? `${settings.passing_score_percent}%` : '—'}</p>
                <p className="mt-1 text-[10px] leading-tight text-slate-800/70 sm:text-sm">{translate(language, 'mockExamPage.passingScore')}</p>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-center text-sm text-red-600 dark:text-[#F87171]">
              {translateMessage(language, error)}
            </p>
          )}

          <div className="flex justify-center pt-1">
            <button type="button"
              onClick={startExam}
              disabled={loading || settingsLoading}
              className={`inline-flex min-h-12 min-w-44 items-center justify-center gap-2 rounded-full px-8 py-3 font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-[rgba(126,162,248,0.40)] ${BTN_PRIMARY}`}
            >
              {loading
                ? translate(language, 'mockExamPage.loadingQuestions')
                : translate(language, 'mockExamPage.startExam')}
              {!loading && <ChevronRight className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ============================ RESULT ============================ */
  if (stage === 'result') {
    const total = questions.length;
    let correct = 0;
    for (const q of questions) {
      const chosen = userAnswers[q.id];
      const ch: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
      if (chosen && ch.find(c => c.id === chosen)?.is_correct) correct++;
    }
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = hasPassedMockExam(correct, total, settings?.passing_score_percent ?? DEFAULT_MOCK_EXAM_SETTINGS.passing_score_percent);
    const timeTaken = examDuration - timeLeft;

    return (
      <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.examResults')} subtitle={translate(language, 'mockExamPage.mockExam')}>
        <div className="mx-auto max-w-2xl space-y-5">
          <div className={`${CARD} relative overflow-hidden p-8 text-center`}>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full ${passed ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}
            />
            <div className="relative">
              <ResultRing
                percent={pct}
                display={`${pct}%`}
                colorClass={passed ? 'text-emerald-500 dark:text-[#4CC9B0]' : 'text-red-500 dark:text-[#F87171]'}
                trackClass={passed ? 'text-emerald-100 dark:text-white/10' : 'text-red-100 dark:text-white/10'}
              />
              <p className={`mt-5 text-xl font-bold ${passed ? 'text-emerald-700 dark:text-[#4CC9B0]' : 'text-red-600 dark:text-[#F87171]'}`}>
                {passed ? (translate(language, 'mockExamPage.passedCongratulations')) : (translate(language, 'mockExamPage.notPassedTryAgain'))}
              </p>
              <p className="mt-2 text-gray-500 dark:text-[#94A3B8]">{translate(language, 'mockExamPage.resultSummary', { total, correct, time: formatTime(timeTaken) })}</p>
            </div>
          </div>

          {/* Per-question review */}
          <div className={`${CARD} p-5 sm:p-6`}>
            <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-[#F8FAFC]">{translate(language, 'mockExamPage.perQuestionResults')}</h3>
            <div className="space-y-2.5">
              {questions.map((q, i) => {
                const chosen = userAnswers[q.id];
                const ch: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
                const isCorrect = !!chosen && (ch.find(c => c.id === chosen)?.is_correct ?? false);
                const correctChoice = ch.find(c => c.is_correct);
                return (
                  <div key={q.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3 dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.04)]">
                    {isCorrect
                      ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500 dark:text-[#4CC9B0]" />
                      : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-[#F87171]" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 dark:text-[#F8FAFC]">{translate(language, 'mockExamPage.questionNumber', { number: i + 1 })}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-[#94A3B8]">
                        {q.question_text.length > 60 ? `${q.question_text.slice(0, 60)}...` : q.question_text}
                      </p>
                      {!isCorrect && correctChoice && (
                        <p className="mt-0.5 text-xs text-emerald-600 dark:text-[#4CC9B0]">{translate(language, 'mockExamPage.correct')}: {correctChoice.choice_text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button type="button"
              onClick={() => { finishingRef.current = false; setStage('intro'); setUserAnswers({}); setReviewMarks({}); setShowConfirm(false); setCurrentIndex(0); setTimeLeft(examDuration); setSessionId(null); }}
              className={`rounded-full px-6 py-3 font-semibold transition ${BTN_GHOST}`}
            >
              {translate(language, 'mockExamPage.retake')}
            </button>
            <button type="button"
              onClick={() => onNavigate('home')}
              className={`rounded-full px-6 py-3 font-semibold transition ${BTN_PRIMARY}`}
            >
              {translate(language, 'mockExamPage.home')}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // Phòng trường hợp chưa có câu hỏi nào (tránh lỗi question.id của undefined)
  if (!question) {
    return (
      <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.inProgress')}>
        <div className="mx-auto max-w-md p-6 text-center text-sm text-gray-500 dark:text-[#94A3B8]">
          {translate(language, 'mockExamPage.loadingQuestions')}
        </div>
      </Layout>
    );
  }

  /* ============================ EXAM ============================ */
  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.inProgress')}>
      <div className="mx-auto max-w-7xl">
        {/* Timer banner */}
        <div className={`${BANNER} mb-5 p-4 sm:p-5`}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-0 h-full w-1/4 rounded-l-full bg-white/40 dark:bg-white/5"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <span className="text-base font-bold text-indigo-950 dark:text-[#F8FAFC]">{translate(language, 'mockExamPage.questionProgress', { current: currentIndex + 1, total: questions.length })}</span>
            <div className={`flex items-center gap-2 rounded-full px-4 py-1.5 ${timeWarning
              ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-[#F87171]'
              : 'bg-white/70 text-indigo-900 dark:bg-white/10 dark:text-[#F8FAFC]'}`}>
              <Clock className="h-4 w-4" />
              <span className="font-mono text-sm font-bold">{formatTime(timeLeft)}</span>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-gray-500 dark:bg-white/10 dark:text-[#94A3B8]">{translate(language, 'mockExamPage.answeredProgress', { answered: answeredCount, total: questions.length })}</span>
          </div>
          <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${timeWarning ? 'bg-red-400 dark:bg-[#F87171]' : 'bg-emerald-400 dark:bg-[#4CC9B0]'}`}
              style={{ width: `${(timeLeft / examDuration) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Question */}
          <div className="min-w-0 flex-1 space-y-4">
            <div ref={questionCardRef} className={`${CARD} scroll-mt-4 p-6`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 dark:bg-[rgba(126,162,248,0.14)] dark:text-[#7EA2F8]">
                  {translate(language, 'mockExamPage.questionNumber', { number: currentIndex + 1 })}
                </p>
                <div className="flex items-center gap-1.5" role="group" aria-label={translate(language, 'mockExamPage.reviewMark')}>
                  <span className="mr-1 text-xs font-medium text-gray-500 dark:text-[#94A3B8]">
                    {translate(language, 'mockExamPage.reviewMark')}
                  </span>
                  {(['red', 'yellow', 'green'] as const).map(mark => {
                    const labelKey = {
                      red: 'mockExamPage.markRed',
                      yellow: 'mockExamPage.markYellow',
                      green: 'mockExamPage.markGreen',
                    }[mark] as 'mockExamPage.markRed' | 'mockExamPage.markYellow' | 'mockExamPage.markGreen';
                    const selected = reviewMarks[question.id] === mark;
                    return (
                      <button
                        key={mark}
                        type="button"
                        onClick={() => changeReviewMark(mark)}
                        aria-label={translate(language, labelKey)}
                        aria-pressed={selected}
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${REVIEW_MARK_STYLES[mark]} ${selected ? 'ring-2 ring-slate-700 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''}`}
                      >
                        <Flag className="h-3.5 w-3.5" fill="currentColor" />
                      </button>
                    );
                  })}
                  {reviewMarks[question.id] && (
                    <button
                      type="button"
                      onClick={() => changeReviewMark(null)}
                      aria-label={translate(language, 'mockExamPage.clearReviewMark')}
                      className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-[#94A3B8] dark:hover:bg-white/10 dark:hover:text-[#F8FAFC]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800 dark:text-[#F8FAFC]">{question.question_text}</p>
              <QuestionImage question={question} />
            </div>

            <div className="space-y-3">
              {choices.map((choice, idx) => {
                const selected = userAnswers[question.id] === choice.id;
                return (
                  <button type="button"
                    key={choice.id}
                    onClick={() => setUserAnswers(prev => ({ ...prev, [question.id]: choice.id }))}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left text-slate-800 transition-all dark:text-[#F8FAFC] ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 dark:border-[#7EA2F8] dark:bg-[rgba(126,162,248,0.14)]'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.04)] dark:hover:bg-[rgba(126,162,248,0.10)]'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      selected
                        ? 'border-indigo-500 bg-indigo-500 text-white dark:border-[#7EA2F8] dark:bg-[#7EA2F8] dark:text-slate-950'
                        : 'border-gray-300 text-gray-400 dark:border-slate-500 dark:text-[#94A3B8]'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <AnswerChoiceContent question={question} choice={choice} displayIndex={idx} />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(i => i - 1)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-5 ${BTN_SECONDARY}`}
              >
                <ChevronLeft className="h-4 w-4" />{translate(language, 'mockExamPage.previous')}
              </button>

              <button
                type="button"
                onClick={toggleQuestionList}
                aria-expanded={mobileQuestionListOpen}
                aria-controls="exam-question-list"
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-2.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:border-[rgba(126,162,248,0.40)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[#7EA2F8] dark:hover:bg-[rgba(126,162,248,0.12)] lg:hidden"
              >
                <List className="h-4 w-4 shrink-0" />
                <span className="truncate">{translate(language, 'mockExamPage.goToQuestionList')}</span>
              </button>

              {currentIndex + 1 < questions.length ? (
                <button type="button"
                  onClick={() => setCurrentIndex(i => i + 1)}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-5 py-2.5 text-sm font-semibold transition sm:gap-2 sm:px-7 ${BTN_PRIMARY}`}
                >
                  {translate(language, 'mockExamPage.next')} <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="button"
                  onClick={requestFinish}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition sm:px-7 ${BTN_SUCCESS}`}
                >
                  {translate(language, 'mockExamPage.finishExam')}
                </button>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div
            id="exam-question-list"
            ref={questionListRef}
            className={`w-full shrink-0 scroll-mt-4 lg:block lg:w-52 xl:w-72 2xl:w-96 ${mobileQuestionListOpen ? 'block' : 'hidden'}`}
          >
            <div className={`${CARD} p-4 lg:sticky lg:top-5`}>
              <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-[#F8FAFC]">{translate(language, 'mockExamPage.questionList')}</p>
              <div className="rounded-2xl bg-gray-50/70 p-2.5 dark:bg-[rgba(255,255,255,0.04)]">
                <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                  {questions.map((q, i) => {
                    let cls = 'bg-white text-gray-500 border border-gray-100 hover:border-indigo-300 hover:text-indigo-600 dark:bg-[rgba(255,255,255,0.06)] dark:text-[#CBD5E1] dark:border-[rgba(255,255,255,0.08)]';
                    const reviewMark = reviewMarks[q.id];
                    if (reviewMark) cls = REVIEW_MARK_STYLES[reviewMark];
                    else if (userAnswers[q.id]) cls = 'bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700';
                    if (i === currentIndex) {
                      cls = reviewMark
                        ? `${cls} ring-2 ring-indigo-500 ring-offset-2 dark:ring-[#7EA2F8] dark:ring-offset-slate-900`
                        : 'bg-indigo-500 text-white ring-2 ring-indigo-500 ring-offset-2 dark:bg-[#7EA2F8] dark:text-slate-950 dark:ring-[#7EA2F8] dark:ring-offset-slate-900';
                    }
                    return (
                      <button type="button"
                        key={q.id}
                        onClick={() => selectQuestion(i)}
                        aria-label={translate(language, 'mockExamPage.questionNumber', { number: i + 1 })}
                        className={`aspect-square w-full min-w-0 rounded-full text-xs font-bold transition ${cls}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-4 text-center dark:border-[rgba(255,255,255,0.10)]">
                <p className="text-xs text-gray-400 dark:text-[#94A3B8]">{translate(language, 'mockExamPage.answeredCount', { answered: answeredCount, total: questions.length })}</p>
              </div>
              <button type="button"
                onClick={requestFinish}
                className={`mt-3 w-full rounded-full py-2.5 text-xs font-semibold transition ${BTN_SUCCESS}`}
              >
                {translate(language, 'mockExamPage.submit')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showConfirm && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-finish-title"
            aria-describedby="confirm-finish-desc"
            className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="confirm-finish-title" className="text-base font-bold text-gray-800 dark:text-slate-50">
                  {translate(language, 'mockExamPage.unansweredWarningTitle')}
                </h3>
                <p id="confirm-finish-desc" className="mt-1 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  {translate(language, 'mockExamPage.unansweredWarningMessage', { count: unansweredCount })}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button"
                onClick={() => setShowConfirm(false)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${BTN_GHOST}`}
              >
                {translate(language, 'mockExamPage.continueExam')}
              </button>
              <button type="button"
                onClick={() => { setShowConfirm(false); void finishExam(); }}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${BTN_SUCCESS}`}
              >
                {translate(language, 'mockExamPage.submitAnyway')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pendingNavigation && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
          onClick={cancelLeaveExam}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-exam-title"
            aria-describedby="leave-exam-desc"
            className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-[rgba(126,162,248,0.15)] dark:text-[#7EA2F8]">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="leave-exam-title" className="text-base font-bold text-gray-800 dark:text-slate-50">
                  {translate(language, 'mockExamPage.leaveExamTitle')}
                </h3>
                <p id="leave-exam-desc" className="mt-1 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  {translate(language, 'mockExamPage.leaveExamMessage')}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button"
                onClick={cancelLeaveExam}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${BTN_GHOST}`}
              >
                {translate(language, 'mockExamPage.stayInExam')}
              </button>
              <button type="button"
                onClick={confirmLeaveExam}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${BTN_PRIMARY}`}
              >
                {translate(language, 'mockExamPage.leaveExamAnyway')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Layout>
  );
}