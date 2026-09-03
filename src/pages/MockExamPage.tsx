import { translate } from '../i18n';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, BarChart2 } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Question, AnswerChoice, Page } from '../types';

interface MockExamPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const EXAM_DURATION = 90 * 60; // 90 minutes in seconds

export default function MockExamPage({ currentPage, onNavigate }: MockExamPageProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [stage, setStage] = useState<'intro' | 'exam' | 'result'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);

  async function startExam() {
    setLoading(true);
    finishingRef.current = false;
    setUserAnswers({});
    setCurrentIndex(0);
    setTimeLeft(EXAM_DURATION);
    setSessionId(null);
    const { data } = await supabase
      .from('questions')
      .select('*, answer_choices(*)')
      .order('question_number');
    if (data && data.length > 0) {
      const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, Math.min(8, data.length));
      setQuestions(shuffled as Question[]);
      if (user) {
        const { data: s } = await supabase
          .from('exam_sessions')
          .insert({ user_id: user.id, total_questions: shuffled.length })
          .select()
          .single();
        if (s) setSessionId(s.id);
      }
      setStage('exam');
    }
    setLoading(false);
  }

  const finishExam = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = EXAM_DURATION - timeLeft;
    let correct = 0;
    for (const q of questions) {
      const chosen = userAnswers[q.id];
      const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
      if (chosen && choices.find(c => c.id === chosen)?.is_correct) correct++;
    }
    if (sessionId) {
      await supabase.from('exam_sessions').update({
        correct_answers: correct,
        time_taken_seconds: timeTaken,
        completed_at: new Date().toISOString(),
      }).eq('id', sessionId);
      for (const q of questions) {
        const chosen = userAnswers[q.id];
        if (!chosen) continue;
        const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
        const isCorrect = choices.find(c => c.id === chosen)?.is_correct ?? false;
        await supabase.from('exam_answers').insert({
          exam_session_id: sessionId,
          question_id: q.id,
          selected_choice_id: chosen,
          is_correct: isCorrect,
        });
      }
    }
    setStage('result');
  }, [questions, sessionId, timeLeft, userAnswers]);

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
  const choices: AnswerChoice[] = [...(question?.answer_choices ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const answeredCount = Object.keys(userAnswers).length;
  const timeWarning = timeLeft < 600;

  if (stage === 'intro') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'mockExamPage.mockExam')} subtitle={translate(language, 'mockExamPage.studyMenu')}>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <BarChart2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{translate(language, 'mockExamPage.mockExam')}</h2>
            <p className="text-gray-500 mb-8">{translate(language, 'mockExamPage.checkYourAbilityInTheSameFormatAs')}</p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-gray-800">8</p>
                <p className="text-xs text-gray-400 mt-1">{translate(language, 'mockExamPage.questions')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-gray-800">90</p>
                <p className="text-xs text-gray-400 mt-1">{translate(language, 'mockExamPage.timeLimitMin')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-gray-800">70%</p>
                <p className="text-xs text-gray-400 mt-1">{translate(language, 'mockExamPage.passingScore')}</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-8 text-left">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  {translate(language, 'mockExamPage.youCannotPauseTheExamOnceItStarts')}
                </p>
              </div>
            </div>
            <button
              onClick={startExam}
              disabled={loading}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
            >
              {loading ? (translate(language, 'mockExamPage.loadingQuestions')) : (translate(language, 'mockExamPage.startExam'))}
            </button>
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
    const passed = pct >= 70;
    const timeTaken = EXAM_DURATION - timeLeft;

    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'mockExamPage.examResults')} subtitle={translate(language, 'mockExamPage.mockExam')}>
        <div className="max-w-2xl mx-auto space-y-5">
          <div className={`rounded-2xl p-8 text-center ${passed ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-6xl font-bold mb-2 ${passed ? 'text-emerald-600' : 'text-red-500'}`}>{pct}%</p>
            <p className={`text-xl font-bold ${passed ? 'text-emerald-700' : 'text-red-700'}`}>
              {passed ? (translate(language, 'mockExamPage.passedCongratulations')) : (translate(language, 'mockExamPage.notPassedTryAgain'))}
            </p>
            <p className="text-gray-500 mt-2">{translate(language, 'mockExamPage.resultSummary', { total, correct, time: formatTime(timeTaken) })}</p>
          </div>

          {/* Per-question review */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 mb-4">{translate(language, 'mockExamPage.perQuestionResults')}</h3>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const chosen = userAnswers[q.id];
                const ch: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
                const isCorrect = !!chosen && (ch.find(c => c.id === chosen)?.is_correct ?? false);
                const correctChoice = ch.find(c => c.is_correct);
                return (
                  <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                    {isCorrect
                      ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{translate(language, 'mockExamPage.questionNumber', { number: i + 1 })}</p>
                      <p className="text-xs text-gray-500 truncate">{q.question_text.slice(0, 60)}...</p>
                      {!isCorrect && correctChoice && (
                        <p className="text-xs text-emerald-600 mt-0.5">{translate(language, 'mockExamPage.correct')}: {correctChoice.choice_text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => { finishingRef.current = false; setStage('intro'); setUserAnswers({}); setCurrentIndex(0); setTimeLeft(EXAM_DURATION); setSessionId(null); }} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition">
              {translate(language, 'mockExamPage.retake')}
            </button>
            <button onClick={() => onNavigate('home')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{translate(language, 'mockExamPage.questionProgress', { current: currentIndex + 1, total: questions.length })}</span>
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full ${timeWarning ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>
              <Clock className="w-4 h-4" />
              <span className="text-sm font-bold font-mono">{formatTime(timeLeft)}</span>
            </div>
            <span className="text-sm text-gray-400">{translate(language, 'mockExamPage.answeredProgress', { answered: answeredCount, total: questions.length })}</span>
          </div>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${timeWarning ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${(timeLeft / EXAM_DURATION) * 100}%` }} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Question */}
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-full inline-block mb-4">
                {translate(language, 'mockExamPage.questionNumber', { number: currentIndex + 1 })}
              </p>
              <p className="text-gray-800 leading-relaxed text-sm">{question?.question_text}</p>
            </div>

            <div className="space-y-3">
              {choices.map((choice, idx) => {
                const selected = userAnswers[question?.id] === choice.id;
                return (
                  <button
                    key={choice.id}
                    onClick={() => setUserAnswers(prev => ({ ...prev, [question.id]: choice.id }))}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-400'}`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm text-gray-700">{choice.choice_text}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(i => i - 1)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />{translate(language, 'mockExamPage.previous')}
              </button>
              {currentIndex + 1 < questions.length ? (
                <button
                  onClick={() => setCurrentIndex(i => i + 1)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
                >
                  {translate(language, 'mockExamPage.next')} <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={finishExam}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
                >
                  {translate(language, 'mockExamPage.finishExam')}
                </button>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-52 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">{translate(language, 'mockExamPage.questionList')}</p>
              <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-4 gap-1.5">
                {questions.map((q, i) => {
                  let cls = 'bg-gray-100 text-gray-500';
                  if (i === currentIndex) cls = 'bg-blue-600 text-white';
                  else if (userAnswers[q.id]) cls = 'bg-emerald-100 text-emerald-700';
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
              <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">{translate(language, 'mockExamPage.answeredCount', { answered: answeredCount, total: questions.length })}</p>
              </div>
              <button
                onClick={finishExam}
                className="w-full mt-3 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition"
              >
                {translate(language, 'mockExamPage.submit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
