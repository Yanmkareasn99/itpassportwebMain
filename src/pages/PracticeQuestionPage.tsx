import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Flag, ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalizedExplanation } from '../lib/localizedQuestion';
import { Question, AnswerChoice, Page } from '../types';


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
  const { user } = useAuth();
  const { language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState<PracticeAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
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
  const label = {
    completed: language === 'ja' ? '演習完了' : language === 'en' ? 'Practice complete' : 'Hoàn thành luyện tập',
    practice: language === 'ja' ? '問題演習' : language === 'en' ? 'Practice' : 'Luyện tập',
    questionTitle: language === 'ja' ? '練習問題' : language === 'en' ? 'Practice question' : 'Câu hỏi luyện tập',
    question: language === 'ja' ? '問題' : language === 'en' ? 'Question' : 'Câu',
    accuracy: language === 'ja' ? '正答率' : language === 'en' ? 'Accuracy' : 'Tỷ lệ đúng',
    showExplanation: language === 'ja' ? '解説を見る' : language === 'en' ? 'Show explanation' : 'Xem giải thích',
    hideExplanation: language === 'ja' ? '解説を閉じる' : language === 'en' ? 'Hide explanation' : 'Ẩn giải thích',
    answer: language === 'ja' ? '答える' : language === 'en' ? 'Answer' : 'Trả lời',
    next: language === 'ja' ? '次へ' : language === 'en' ? 'Next' : 'Tiếp',
    result: language === 'ja' ? '結果を見る' : language === 'en' ? 'See results' : 'Xem kết quả',
    previous: language === 'ja' ? '前へ' : language === 'en' ? 'Previous' : 'Trước',
    correct: language === 'ja' ? '正解！' : language === 'en' ? 'Correct!' : 'Đúng!',
    incorrect: language === 'ja' ? '不正解' : language === 'en' ? 'Incorrect' : 'Sai',
    correctAnswer: language === 'ja' ? '正解' : language === 'en' ? 'Correct answer' : 'Đáp án đúng',
    questionList: language === 'ja' ? '問題一覧' : language === 'en' ? 'Question list' : 'Danh sách câu hỏi',
    currentAccuracy: language === 'ja' ? '現在の正答率' : language === 'en' ? 'Current accuracy' : 'Tỷ lệ đúng hiện tại',
    doneMessage: language === 'ja' ? 'お疲れさまでした！' : language === 'en' ? 'Great work!' : 'Bạn làm tốt lắm!',
    total: language === 'ja' ? '出題数' : language === 'en' ? 'Questions' : 'Số câu',
    correctShort: language === 'ja' ? '正解' : language === 'en' ? 'Correct' : 'Đúng',
    wrongShort: language === 'ja' ? '不正解' : language === 'en' ? 'Incorrect' : 'Sai',
    backToSubjects: language === 'ja' ? '科目選択へ戻る' : language === 'en' ? 'Back to subjects' : 'Về chọn môn',
    home: language === 'ja' ? 'ホームへ' : language === 'en' ? 'Home' : 'Trang chủ',
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
  

  

  function handleAnswer(choiceId: string) {
    if (answered) return;
    setSelectedChoiceId(choiceId);
    setAnswered(true);
    setShowExplanation(false);
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

  function goToQuestion(index: number) {
    const priorAnswer = answers.find(answer => answer.questionId === questions[index]?.id);
    setCurrentIndex(index);
    setSelectedChoiceId(priorAnswer?.choiceId ?? null);
    setAnswered(Boolean(priorAnswer));
    setShowExplanation(false);
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
              {language === 'ja' ? `${total}問中 ${correct}問 正解` : `${correct} / ${total} ${label.correctShort.toLowerCase()}`}
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
      <div className="max-w-5xl mx-auto">
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
                    <span className="text-sm text-gray-700 flex-1">{choice.choice_text}</span>
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
          <div className="w-full lg:w-52 shrink-0 space-y-4">
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">{label.questionList}</p>
              <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-4 gap-1.5">
                {questions.map((mappedQuestion, i) => {
                  const ans = answers.find(answer => answer.questionId === mappedQuestion.id);
                  let cls = 'bg-gray-100 text-gray-500';
                  if (i === currentIndex) cls = 'bg-blue-600 text-white';
                  else if (ans?.isCorrect) cls = 'bg-emerald-100 text-emerald-600';
                  else if (ans && !ans.isCorrect) cls = 'bg-red-100 text-red-600';
                  return (
                    <button
                      key={i}
                      onClick={() => goToQuestion(i)}
                      className={`h-8 rounded-lg text-xs font-bold transition ${cls}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Score */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{label.currentAccuracy}</p>
              <p className={`text-3xl font-bold ${accuracyPct >= 70 ? 'text-emerald-600' : accuracyPct >= 50 ? 'text-amber-500' : 'text-gray-700'}`}>
                {accuracyPct}%
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {language === 'ja' ? `${correctSoFar} / ${answers.length} 問正解` : `${correctSoFar} / ${answers.length} ${label.correctShort.toLowerCase()}`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
