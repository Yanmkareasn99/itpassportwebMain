import { translate } from '../i18n';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Flag, ArrowLeft, Sparkles, Loader } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalizedExplanation } from '../lib/localizedQuestion';
import { getChatReply } from '../lib/aiChat';
import { Question, AnswerChoice, Page } from '../types';
import { AnswerChoiceContent, QuestionImage } from '../components/QuestionMedia';


interface PracticeQuestionPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  questions: Question[];
  subjectId: string;
}

interface PracticeAnswer {
  questionId: string;
  choiceId: string;
  isCorrect: boolean;
}

const QUESTION_MAP_PAGE_SIZE = 50;

function TreeDiagram() {
  return (
    <svg viewBox="0 0 260 160" className="w-full max-w-xs mx-auto my-4" fill="none">
      {/* Root: 20 */}
      <circle cx="130" cy="30" r="18" stroke="#3B82F6" strokeWidth="2" fill="#EFF6FF" />
      <text x="130" y="35" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1D4ED8">20</text>
      {/* Left: 10 */}
      <line x1="112" y1="44" x2="72" y2="76" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="60" cy="90" r="18" stroke="#3B82F6" strokeWidth="2" fill="#EFF6FF" />
      <text x="60" y="95" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1D4ED8">10</text>
      {/* Right: 30 */}
      <line x1="148" y1="44" x2="188" y2="76" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="200" cy="90" r="18" stroke="#3B82F6" strokeWidth="2" fill="#EFF6FF" />
      <text x="200" y="95" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1D4ED8">30</text>
      {/* 10's right child: 12 */}
      <line x1="72" y1="104" x2="88" y2="128" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="96" cy="140" r="18" stroke="#3B82F6" strokeWidth="2" fill="#EFF6FF" />
      <text x="96" y="145" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1D4ED8">12</text>
      {/* Placeholder for 15 */}
      <line x1="108" y1="140" x2="128" y2="140" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4" />
      <circle cx="140" cy="140" r="16" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4" fill="#FFFBEB" />
      <text x="140" y="145" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#D97706">?</text>
    </svg>
  );
}

export default function PracticeQuestionPage({ currentPage, onNavigate, questions, subjectId }: PracticeQuestionPageProps) {
  const { user, profile } = useAuth();
  const { language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState<PracticeAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [questionMapPage, setQuestionMapPage] = useState(0);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const sessionCreatedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const pendingAnswersRef = useRef<PracticeAnswer[]>([]);
  

  const question = questions[currentIndex];
  const choices: AnswerChoice[] = [...(question?.answer_choices ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const totalQuestions = questions.length;
  const progressPct = totalQuestions > 0 ? Math.round((answers.length / totalQuestions) * 100) : 0;
  const correctSoFar = answers.filter(a => a.isCorrect).length;
  const accuracyPct = answers.length > 0 ? Math.round((correctSoFar / answers.length) * 100) : 0;
  const explanation = getLocalizedExplanation(question, language);
  const answersByQuestionId = useMemo(
    () => new Map(answers.map(answer => [answer.questionId, answer])),
    [answers],
  );
  const questionMapPageCount = Math.max(1, Math.ceil(totalQuestions / QUESTION_MAP_PAGE_SIZE));
  const questionMapStart = questionMapPage * QUESTION_MAP_PAGE_SIZE;
  const visibleQuestionMap = questions.slice(
    questionMapStart,
    questionMapStart + QUESTION_MAP_PAGE_SIZE,
  );
  const label = {
    completed: translate(language, 'practiceQuestionPage.practiceComplete'),
    practice: translate(language, 'practiceQuestionPage.practice'),
    questionTitle: translate(language, 'practiceQuestionPage.practiceQuestion'),
    question: translate(language, 'practiceQuestionPage.question'),
    accuracy: translate(language, 'practiceQuestionPage.accuracy'),
    showExplanation: translate(language, 'practiceQuestionPage.showExplanation'),
    hideExplanation: translate(language, 'practiceQuestionPage.hideExplanation'),
    answer: translate(language, 'practiceQuestionPage.answer'),
    next: translate(language, 'practiceQuestionPage.next'),
    result: translate(language, 'practiceQuestionPage.seeResults'),
    previous: translate(language, 'practiceQuestionPage.previous'),
    correct: translate(language, 'practiceQuestionPage.correct'),
    incorrect: translate(language, 'practiceQuestionPage.incorrect'),
    correctAnswer: translate(language, 'practiceQuestionPage.correctAnswer'),
    questionList: translate(language, 'practiceQuestionPage.questionList'),
    currentAccuracy: translate(language, 'practiceQuestionPage.currentAccuracy'),
    doneMessage: translate(language, 'practiceQuestionPage.greatWork'),
    total: translate(language, 'practiceQuestionPage.questions'),
    correctShort: translate(language, 'practiceQuestionPage.correct2'),
    wrongShort: translate(language, 'practiceQuestionPage.incorrect'),
    backToSubjects: translate(language, 'practiceQuestionPage.backToSubjects'),
    home: translate(language, 'practiceQuestionPage.home'),
  };
  

  useEffect(() => {
    if (!user || sessionCreatedRef.current) return;
    const currentUser = user;

    async function createSession() {
      sessionCreatedRef.current = true;
      const { data, error } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: currentUser.id,
          subject_id: subjectId === 'all' || subjectId === 'review' ? null : subjectId,
          total_questions: totalQuestions,
        })
        .select()
        .single();
      if (error || !data?.id) return null;

      const createdId = data.id as string;
      sessionIdRef.current = createdId;
      setSessionId(createdId);
      const pending = pendingAnswersRef.current.splice(0);
      await Promise.all(pending.map(answer => supabase.from('session_answers').insert({
        session_id: createdId,
        question_id: answer.questionId,
        selected_choice_id: answer.choiceId,
        is_correct: answer.isCorrect,
      })));
      return createdId;
    }
    sessionPromiseRef.current = createSession();
  }, [subjectId, totalQuestions, user]);

  useEffect(() => {
    setQuestionMapPage(Math.floor(currentIndex / QUESTION_MAP_PAGE_SIZE));
  }, [currentIndex]);
  

  

  function handleAnswer(choiceId: string) {
    if (answered) return;
    setSelectedChoiceId(choiceId);
    setAnswered(true);
    setShowExplanation(false);
    setAiExplanation(null);
    const correct = choices.find(c => c.id === choiceId)?.is_correct ?? false;
    const answer = { questionId: question.id, choiceId, isCorrect: correct };
    setAnswers(prev => [...prev.filter(item => item.questionId !== question.id), answer]);
    const activeSessionId = sessionIdRef.current ?? sessionId;
    if (activeSessionId) {
      void supabase.from('session_answers').insert({
        session_id: activeSessionId,
        question_id: question.id,
        selected_choice_id: choiceId,
        is_correct: correct,
      });
    } else {
      pendingAnswersRef.current = [
        ...pendingAnswersRef.current.filter(item => item.questionId !== question.id),
        answer,
      ];
    }
  }

  async function handleAIExplanation() {
    setIsLoadingAI(true);
    try {
      const selectedChoice = choices.find(c => c.id === selectedChoiceId);
      const selectedIndex = choices.findIndex(c => c.id === selectedChoiceId);
      const correctIndex = choices.findIndex(c => c.is_correct);
      
      const prompt = `${question.question_text}\n\nOptions:\n${choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c.answer_text}`).join('\n')}\n\nMy answer: ${String.fromCharCode(65 + selectedIndex)}\nCorrect answer: ${String.fromCharCode(65 + correctIndex)}\n\nPlease explain why the correct answer is right and help me understand this concept.`;

      const reply = await getChatReply(prompt, {
        language,
        profileName: profile?.name,
        subject: null,
        recentQuestions: [question],
        history: [],
      });
      
      setAiExplanation(reply);
    } catch (err) {
      console.error('AI explanation error:', err);
      setAiExplanation('Failed to get AI explanation. Please try again.');
    } finally {
      setIsLoadingAI(false);
    }
  }

  function goToQuestion(index: number) {
    const priorAnswer = answers.find(answer => answer.questionId === questions[index]?.id);
    setCurrentIndex(index);
    setSelectedChoiceId(priorAnswer?.choiceId ?? null);
    setAnswered(Boolean(priorAnswer));
    setShowExplanation(false);
    setAiExplanation(null);
  }

  async function handleNext() {
    if (currentIndex + 1 >= totalQuestions) {
      const firstUnanswered = questions.findIndex(candidate =>
        !answers.some(answer => answer.questionId === candidate.id));
      if (firstUnanswered >= 0) {
        goToQuestion(firstUnanswered);
        return;
      }
      const actualCorrect = answers.filter(a => a.isCorrect).length;
      const activeSessionId = sessionIdRef.current ?? await sessionPromiseRef.current;
      if (activeSessionId) {
        await supabase.from('practice_sessions').update({
          correct_answers: actualCorrect,
          completed_at: new Date().toISOString(),
        }).eq('id', activeSessionId);
      }
      setFinished(true);
    }else {
      goToQuestion(currentIndex + 1);
    }
  }

  if (finished) {
    const total = answers.length;
    const correct = answers.filter(a => a.isCorrect).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={label.completed} subtitle={label.practice}>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${pct >= 70 ? 'bg-emerald-100' : pct >= 50 ? 'bg-amber-100' : 'bg-red-100'}`}>
              <span className={`text-2xl font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{label.doneMessage}</h2>
            <p className="text-gray-500 mb-6">
              {translate(language, 'practiceQuestionPage.resultSummary', { total, correct })}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-gray-800">{total}</p>
                <p className="text-xs text-gray-400 mt-1">{label.total}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-emerald-600">{correct}</p>
                <p className="text-xs text-gray-400 mt-1">{label.correctShort}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-red-500">{total - correct}</p>
                <p className="text-xs text-gray-400 mt-1">{label.wrongShort}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => onNavigate('practice-list')}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition"
              >
                {label.backToSubjects}
              </button>
              <button
                onClick={() => onNavigate('home')}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
              >
                {label.home}
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const correctChoice = choices.find(c => c.is_correct);
  const selectedCorrect = answered && choices.find(c => c.id === selectedChoiceId)?.is_correct;

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={label.questionTitle} subtitle={label.practice}>
      <div className="max-w-6xl mx-auto">
        {/* Progress bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button onClick={() => onNavigate('practice-list')} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-sm font-semibold text-gray-700">
                {label.question} {currentIndex + 1} / {totalQuestions}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">
                {label.accuracy}: <span className="font-bold text-emerald-600">
                  {accuracyPct}%
                </span>
              </span>
              <button className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition">
                <Flag className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Question panel */}
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                  {label.question} {currentIndex + 1}
                </span>
                <span className="text-xs text-gray-400">{'★'.repeat(question.difficulty)}</span>
              </div>
              <p className="text-gray-800 leading-relaxed text-sm whitespace-pre-line">{question.question_text}</p>
              <QuestionImage question={question} />
              {question.question_type === 'tree' && <TreeDiagram />}
            </div>

            {/* Choices */}
            <div className="space-y-3">
              {choices.map((choice, idx) => {
                let stateClass = 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30';
                if (answered) {
                  if (choice.is_correct) stateClass = 'border-emerald-500 bg-emerald-50';
                  else if (choice.id === selectedChoiceId) stateClass = 'border-red-400 bg-red-50';
                  else stateClass = 'border-gray-100 bg-gray-50/50 opacity-60';
                } else if (selectedChoiceId === choice.id) {
                  stateClass = 'border-blue-500 bg-blue-50';
                }

                return (
                  <button
                    key={choice.id}
                    onClick={() => setSelectedChoiceId(choice.id)}
                    disabled={answered}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${stateClass} disabled:cursor-default`}
                  >
                    <span className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shrink-0 text-gray-400">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <AnswerChoiceContent question={question} choice={choice} displayIndex={idx} />
                    {answered && choice.is_correct && <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
                    {answered && !choice.is_correct && choice.id === selectedChoiceId && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {answered && explanation && (
              <div>
                <button
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline mb-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  {showExplanation ? label.hideExplanation : label.showExplanation}
                </button>
  {showExplanation && (
  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
    <p className="text-sm text-blue-800 leading-relaxed">
      {explanation}
    </p>
  </div>
)}
              </div>
            )}

            {/* AI Explanation */}
            {answered && (
              <div>
                <button
                  onClick={handleAIExplanation}
                  disabled={isLoadingAI}
                  className="flex items-center gap-2 text-sm text-purple-600 font-medium hover:underline mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingAI ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isLoadingAI ? 'AI is thinking...' : 'Ask AI for explanation'}
                </button>
                {aiExplanation && (
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p className="text-sm text-purple-800 leading-relaxed">
                      {aiExplanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                {label.previous}
              </button>
              <div className="flex gap-2">
                {!answered && (
                  <button
                    disabled={!selectedChoiceId}
                    onClick={() => selectedChoiceId && handleAnswer(selectedChoiceId)}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {label.answer}
                  </button>
                )}
                {answered && (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    {currentIndex + 1 >= totalQuestions ? label.result : label.next}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-64 shrink-0 space-y-4 lg:sticky lg:top-5 self-start">
            {/* Result indicator */}
            {answered && (
              <div className={`rounded-2xl p-4 text-center ${selectedCorrect ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                {selectedCorrect ? (
                  <>
                    <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
                    <p className="text-sm font-bold text-emerald-700">{label.correct}</p>
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8 text-red-500 mx-auto mb-1" />
                    <p className="text-sm font-bold text-red-700">{label.incorrect}</p>
                    <p className="text-xs text-red-500 mt-1">{label.correctAnswer}: {correctChoice?.choice_text}</p>
                  </>
                )}
              </div>
            )}

            {/* Question map */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600">{label.questionList}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {answers.length} / {totalQuestions}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[11px] font-bold text-blue-600">
                  {currentIndex + 1} / {totalQuestions}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-2.5">
                <button
                  type="button"
                  onClick={() => setQuestionMapPage(page => Math.max(0, page - 1))}
                  disabled={questionMapPage === 0}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={label.previous}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="relative flex-1">
                  <select
                    value={questionMapPage}
                    onChange={event => setQuestionMapPage(Number(event.target.value))}
                    className="w-full h-8 appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-2.5 pr-7 text-[11px] font-semibold text-gray-600 outline-none hover:border-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                    aria-label={label.questionList}
                  >
                    {Array.from({ length: questionMapPageCount }, (_, page) => {
                      const start = page * QUESTION_MAP_PAGE_SIZE + 1;
                      const end = Math.min((page + 1) * QUESTION_MAP_PAGE_SIZE, totalQuestions);
                      return <option key={page} value={page}>{start}–{end}</option>;
                    })}
                  </select>
                  <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={() => setQuestionMapPage(page => Math.min(questionMapPageCount - 1, page + 1))}
                  disabled={questionMapPage >= questionMapPageCount - 1}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={label.next}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2">
                <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-5 gap-1.5">
                  {visibleQuestionMap.map((mappedQuestion, offset) => {
                    const questionIndex = questionMapStart + offset;
                    const answer = answersByQuestionId.get(mappedQuestion.id);
                    let stateClass = 'bg-white text-gray-500 border-gray-100 hover:border-blue-300 hover:text-blue-600 hover:-translate-y-0.5';
                    if (questionIndex === currentIndex) {
                      stateClass = 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200 ring-2 ring-blue-100';
                    } else if (answer?.isCorrect) {
                      stateClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
                    } else if (answer) {
                      stateClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100';
                    }

                    return (
                      <button
                        key={mappedQuestion.id}
                        type="button"
                        onClick={() => goToQuestion(questionIndex)}
                        className={`h-8 min-w-0 rounded-lg border text-[11px] font-bold transition-all ${stateClass}`}
                        aria-label={`${label.question} ${questionIndex + 1}`}
                        aria-current={questionIndex === currentIndex ? 'step' : undefined}
                      >
                        {questionIndex + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{currentIndex + 1}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />{label.correctShort}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />{label.wrongShort}</span>
              </div>
            </div>

            {/* Score */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{label.currentAccuracy}</p>
              <p className={`text-3xl font-bold ${accuracyPct >= 70 ? 'text-emerald-600' : accuracyPct >= 50 ? 'text-amber-500' : 'text-gray-700'}`}>
                {accuracyPct}%
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {translate(language, 'practiceQuestionPage.currentResult', { correct: correctSoFar, total: answers.length })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
