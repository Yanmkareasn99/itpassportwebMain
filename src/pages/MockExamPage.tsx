import { translateMessage, translate } from '../i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, BarChart2, Flag, List, X } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { DEFAULT_MOCK_EXAM_SETTINGS, fetchMockExamSettings, hasPassedMockExam, type MockExamSettings } from '../lib/mockExamSettings';
import { awardLocalAnswerPoints } from '../lib/points';
import { Question, AnswerChoice, Page } from '../types';
import { AnswerChoiceContent, QuestionImage } from '../components/QuestionMedia';
import { createAnswerChoiceOrders, getRandomizeAnswerChoicesPreference, shuffleItems } from '../lib/questionRandomization';
import { loadQuestionCatalog } from '../lib/practice';

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
      const questionCatalog = await loadQuestionCatalog();
      if (questionCatalog.length < config.question_count) {
        throw new Error(`This exam requires ${config.question_count} questions, but only ${questionCatalog.length} are available. Please ask an administrator to add questions or reduce the exam question count.`);
      }
      const selected = shuffleItems(questionCatalog).slice(0, config.question_count) as Question[];
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

  if (stage === 'intro') {
    return (
      <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.studyMenu')}>
        <div className="min-h-full rounded-3xl bg-slate-50/80 px-4 py-6 dark:bg-slate-900/60 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-3xl border border-blue-100/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none sm:p-8 lg:p-10">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                <BarChart2 className="h-8 w-8" strokeWidth={2.2} />
              </div>

              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                  {translate(language, 'mockExamPage.mockExam')}
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-300 sm:text-base">
                  {translate(language, 'mockExamPage.checkYourAbilityInTheSameFormatAs')}
                </p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
                <div className="rounded-2xl border border-blue-100/70 bg-blue-50/70 px-2 py-3 text-center dark:border-blue-400/20 dark:bg-blue-500/10 sm:px-4 sm:py-5">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300 dark:shadow-none sm:mb-3 sm:h-10 sm:w-10">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="text-xl font-bold leading-none text-slate-900 dark:text-slate-50 sm:text-3xl">{settings?.question_count ?? '—'}</p>
                  <p className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-300 sm:text-sm">{translate(language, 'mockExamPage.questions')}</p>
                </div>
                <div className="rounded-2xl border border-violet-100/70 bg-violet-50/70 px-2 py-3 text-center dark:border-violet-400/20 dark:bg-violet-500/10 sm:px-4 sm:py-5">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm dark:bg-slate-700 dark:text-violet-300 dark:shadow-none sm:mb-3 sm:h-10 sm:w-10">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="text-xl font-bold leading-none text-slate-900 dark:text-slate-50 sm:text-3xl">{settings?.duration_minutes ?? '—'}</p>
                  <p className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-300 sm:text-sm">{translate(language, 'mockExamPage.timeLimitMin')}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/70 px-2 py-3 text-center dark:border-emerald-400/20 dark:bg-emerald-500/10 sm:px-4 sm:py-5">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm dark:bg-slate-700 dark:text-emerald-300 dark:shadow-none sm:mb-3 sm:h-10 sm:w-10">
                    <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="text-xl font-bold leading-none text-slate-900 dark:text-slate-50 sm:text-3xl">{settings ? `${settings.passing_score_percent}%` : '—'}</p>
                  <p className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-300 sm:text-sm">{translate(language, 'mockExamPage.passingScore')}</p>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-400/30 dark:bg-amber-500/10">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />
                <p className="text-sm leading-6 text-amber-800 dark:text-amber-100">
                  {translate(language, 'mockExamPage.youCannotPauseTheExamOnceItStarts')}
                </p>
              </div>

              {error && (
                <p role="alert" className="mt-4 text-center text-sm text-red-600 dark:text-red-300">
                  {translateMessage(language, error)}
                </p>
              )}

              <div className="mt-7 flex justify-center">
                <button type="button"
                  onClick={startExam}
                  disabled={loading || settingsLoading}
                  className="inline-flex min-h-12 min-w-44 items-center justify-center gap-2 rounded-full bg-blue-600 px-8 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 dark:bg-blue-500 dark:shadow-none dark:hover:bg-blue-400 dark:focus:ring-blue-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? translate(language, 'mockExamPage.loadingQuestions')
                    : translate(language, 'mockExamPage.startExam')}
                  {!loading && <ChevronRight className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

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
        <div className="max-w-2xl mx-auto space-y-5">
          <div className={`rounded-2xl p-8 text-center border ${passed
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-400/30'
            : 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-400/30'}`}>
            <p className={`text-6xl font-bold mb-2 ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{pct}%</p>
            <p className={`text-xl font-bold ${passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              {passed ? (translate(language, 'mockExamPage.passedCongratulations')) : (translate(language, 'mockExamPage.notPassedTryAgain'))}
            </p>
            <p className="text-gray-500 dark:text-slate-300 mt-2">{translate(language, 'mockExamPage.resultSummary', { total, correct, time: formatTime(timeTaken) })}</p>
          </div>

          {/* Per-question review */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
            <h3 className="font-semibold text-gray-700 dark:text-slate-100 mb-4">{translate(language, 'mockExamPage.perQuestionResults')}</h3>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const chosen = userAnswers[q.id];
                const ch: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
                const isCorrect = !!chosen && (ch.find(c => c.id === chosen)?.is_correct ?? false);
                const correctChoice = ch.find(c => c.is_correct);
                return (
                  <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-transparent dark:border-slate-700">
                    {isCorrect
                      ? <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                      : <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-slate-100">{translate(language, 'mockExamPage.questionNumber', { number: i + 1 })}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {q.question_text.length > 60 ? `${q.question_text.slice(0, 60)}...` : q.question_text}
                      </p>
                      {!isCorrect && correctChoice && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5">{translate(language, 'mockExamPage.correct')}: {correctChoice.choice_text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button type="button" onClick={() => { finishingRef.current = false; setStage('intro'); setUserAnswers({}); setReviewMarks({}); setShowConfirm(false); setCurrentIndex(0); setTimeLeft(examDuration); setSessionId(null); }} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
              {translate(language, 'mockExamPage.retake')}
            </button>
            <button type="button" onClick={() => onNavigate('home')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition dark:bg-blue-500 dark:hover:bg-blue-400">
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
        <div className="mx-auto max-w-md p-6 text-center text-sm text-gray-500 dark:text-slate-300">
          {translate(language, 'mockExamPage.loadingQuestions')}
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.inProgress')}>
      <div className="max-w-7xl mx-auto">
        {/* Timer bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-4 mb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-100">{translate(language, 'mockExamPage.questionProgress', { current: currentIndex + 1, total: questions.length })}</span>
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full ${timeWarning
              ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
              : 'bg-gray-50 text-gray-700 dark:bg-slate-700 dark:text-slate-100'}`}>
              <Clock className="w-4 h-4" />
              <span className="text-sm font-bold font-mono">{formatTime(timeLeft)}</span>
            </div>
            <span className="text-sm text-gray-400 dark:text-slate-300">{translate(language, 'mockExamPage.answeredProgress', { answered: answeredCount, total: questions.length })}</span>
          </div>
          <div className="mt-3 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${timeWarning ? 'bg-red-400 dark:bg-red-400' : 'bg-emerald-400 dark:bg-emerald-400'}`} style={{ width: `${(timeLeft / examDuration) * 100}%` }} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Question */}
          <div className="flex-1 space-y-4">
            <div ref={questionCardRef} className="scroll-mt-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="inline-block rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                  {translate(language, 'mockExamPage.questionNumber', { number: currentIndex + 1 })}
                </p>
                <div className="flex items-center gap-1.5" role="group" aria-label={translate(language, 'mockExamPage.reviewMark')}>
                  <span className="mr-1 text-xs font-medium text-gray-500 dark:text-slate-300">
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
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${REVIEW_MARK_STYLES[mark]} ${selected ? 'ring-2 ring-slate-700 ring-offset-2 dark:ring-white dark:ring-offset-slate-800' : ''}`}
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
                      className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-gray-800 dark:text-slate-100 leading-relaxed text-sm whitespace-pre-line">{question.question_text}</p>
              <QuestionImage question={question} />
            </div>

            <div className="space-y-3">
              {choices.map((choice, idx) => {
                const selected = userAnswers[question.id] === choice.id;
                return (
                  <button type="button"
                    key={choice.id}
                    onClick={() => setUserAnswers(prev => ({ ...prev, [question.id]: choice.id }))}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 text-gray-800 dark:text-slate-100 ${
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-400/70 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                      selected
                        ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:bg-blue-500 dark:text-white'
                        : 'border-gray-300 text-gray-400 dark:border-slate-500 dark:text-slate-300'
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
                className="flex shrink-0 items-center gap-1 px-2.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700 sm:gap-2 sm:px-4"
              >
                <ChevronLeft className="w-4 h-4" />{translate(language, 'mockExamPage.previous')}
              </button>

              <button
                type="button"
                onClick={toggleQuestionList}
                aria-expanded={mobileQuestionListOpen}
                aria-controls="exam-question-list"
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-blue-200 bg-white px-2 py-2.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 dark:border-blue-400/40 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700 lg:hidden"
              >
                <List className="h-4 w-4 shrink-0" />
                <span className="truncate">{translate(language, 'mockExamPage.goToQuestionList')}</span>
              </button>

              {currentIndex + 1 < questions.length ? (
                <button type="button"
                  onClick={() => setCurrentIndex(i => i + 1)}
                  className="flex shrink-0 items-center gap-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition dark:bg-blue-500 dark:hover:bg-blue-400 sm:gap-2 sm:px-6"
                >
                  {translate(language, 'mockExamPage.next')} <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button"
                  onClick={requestFinish}
                  className="shrink-0 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition dark:bg-emerald-500 dark:hover:bg-emerald-400 sm:px-6"
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
            className={`scroll-mt-4 w-full shrink-0 lg:block lg:w-52 xl:w-72 2xl:w-96 ${mobileQuestionListOpen ? 'block' : 'hidden'}`}
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-300 mb-3">{translate(language, 'mockExamPage.questionList')}</p>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                {questions.map((q, i) => {
                  let cls = 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600';
                  const reviewMark = reviewMarks[q.id];
                  if (reviewMark) cls = REVIEW_MARK_STYLES[reviewMark];
                  else if (userAnswers[q.id]) cls = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
                  if (i === currentIndex) {
                    cls = reviewMark
                      ? `${cls} ring-2 ring-blue-600 ring-offset-2 dark:ring-blue-300 dark:ring-offset-slate-800`
                      : 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2 dark:bg-blue-500 dark:ring-blue-300 dark:ring-offset-slate-800';
                  }
                  return (
                    <button type="button"
                      key={q.id}
                      onClick={() => selectQuestion(i)}
                      aria-label={translate(language, 'mockExamPage.questionNumber', { number: i + 1 })}
                      className={`h-8 rounded-lg text-xs font-bold transition ${cls}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 text-center">
                <p className="text-xs text-gray-400 dark:text-slate-300">{translate(language, 'mockExamPage.answeredCount', { answered: answeredCount, total: questions.length })}</p>
              </div>
              <button type="button"
                onClick={requestFinish}
                className="w-full mt-3 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition dark:bg-emerald-500 dark:hover:bg-emerald-400"
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
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300">
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
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {translate(language, 'mockExamPage.continueExam')}
              </button>
              <button type="button"
                onClick={() => { setShowConfirm(false); void finishExam(); }}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
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
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
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
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {translate(language, 'mockExamPage.stayInExam')}
              </button>
              <button type="button"
                onClick={confirmLeaveExam}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
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
