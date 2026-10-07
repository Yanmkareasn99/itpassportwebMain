import { translateMessage, translate } from '../i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, BarChart2 } from 'lucide-react';
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);
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
      for (const q of questions) {
        const chosen = userAnswers[q.id];
        if (!chosen) continue;
        const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
        const isCorrect = choices.find(c => c.id === chosen)?.is_correct ?? false;
        if (user) await awardLocalAnswerPoints(user.id, isCorrect, 'mock');
        const { error: answerError } = await supabase.from('exam_answers').insert({
          exam_session_id: sessionId,
          question_id: q.id,
          selected_choice_id: chosen,
          is_correct: isCorrect,
        });
        if (answerError) console.error('Failed to save exam answer:', answerError.message);
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

  if (stage === 'intro') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.studyMenu')}>
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
                <button
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
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'mockExamPage.examResults')} subtitle={translate(language, 'mockExamPage.mockExam')}>
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
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{q.question_text.slice(0, 60)}...</p>
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
            <button onClick={() => { finishingRef.current = false; setStage('intro'); setUserAnswers({}); setCurrentIndex(0); setTimeLeft(examDuration); setSessionId(null); }} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
              {translate(language, 'mockExamPage.retake')}
            </button>
            <button onClick={() => onNavigate('home')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition dark:bg-blue-500 dark:hover:bg-blue-400">
              {translate(language, 'mockExamPage.home')}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.inProgress')}>
      <div className="max-w-5xl mx-auto">
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-6">
              <p className="text-xs text-blue-600 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-500/20 px-2.5 py-1 rounded-full inline-block mb-4">
                {translate(language, 'mockExamPage.questionNumber', { number: currentIndex + 1 })}
              </p>
              <p className="text-gray-800 dark:text-slate-100 leading-relaxed text-sm whitespace-pre-line">{question?.question_text}</p>
              <QuestionImage question={question} />
            </div>

            <div className="space-y-3">
              {choices.map((choice, idx) => {
                const selected = userAnswers[question?.id] === choice.id;
                return (
                  <button
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

            <div className="flex items-center justify-between pt-2">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(i => i - 1)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />{translate(language, 'mockExamPage.previous')}
              </button>
              {currentIndex + 1 < questions.length ? (
                <button
                  onClick={() => setCurrentIndex(i => i + 1)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {translate(language, 'mockExamPage.next')} <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={requestFinish}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  {translate(language, 'mockExamPage.finishExam')}
                </button>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-52 shrink-0">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-300 mb-3">{translate(language, 'mockExamPage.questionList')}</p>
              <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-4 gap-1.5">
                {questions.map((q, i) => {
                  let cls = 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600';
                  if (i === currentIndex) cls = 'bg-blue-600 text-white dark:bg-blue-500';
                  else if (userAnswers[q.id]) cls = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
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
              <button
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
                
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {translate(language, 'mockExamPage.continueExam')}
              </button>
              <button
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
    </Layout>
  );
}