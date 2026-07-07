import { useState, useEffect, useCallback } from 'react';
import { Trophy, Users, Clock, Zap, CheckCircle, XCircle, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Question, AnswerChoice, BattleRoom, Page } from '../types';

interface BattlePageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const BATTLE_QUESTIONS = 5;
const TIME_PER_QUESTION = 30;

type BattleStage = 'lobby' | 'waiting' | 'battle' | 'result';

export default function BattlePage({ currentPage, onNavigate }: BattlePageProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const [stage, setStage] = useState<BattleStage>('lobby');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [rooms, setRooms] = useState<BattleRoom[]>([]);
  const [aiDelay, setAiDelay] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    const { data } = await supabase
      .from('battle_rooms')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setRooms(data);
  }

  const goToNextQuestion = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setStage('result');
      return;
    }
    setCurrentIndex(i => i + 1);
    setSelectedChoice(null);
    setAnswered(false);
    setTimeLeft(TIME_PER_QUESTION);
  }, [currentIndex, questions.length]);

  useEffect(() => {
    if (stage !== 'battle' || answered) return;
    if (timeLeft <= 0) {
      setAnswered(true);
      // AI answers
      const t = setTimeout(() => goToNextQuestion(), 1500);
      setAiDelay(t);
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, timeLeft, answered, goToNextQuestion]);

  useEffect(() => {
    return () => { if (aiDelay) clearTimeout(aiDelay); };
  }, [aiDelay]);

  async function startBattle() {
    const { data } = await supabase
      .from('questions')
      .select('*, answer_choices(*)')
      .order('question_number');
    if (!data || data.length === 0) return;
    const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, Math.min(BATTLE_QUESTIONS, data.length));
    setQuestions(shuffled as Question[]);
    setCurrentIndex(0);
    setPlayerScore(0);
    setAiScore(0);
    setSelectedChoice(null);
    setAnswered(false);
    setTimeLeft(TIME_PER_QUESTION);
    setStage('battle');
  }

  function handleAnswer(choiceId: string) {
    if (answered) return;
    setSelectedChoice(choiceId);
    setAnswered(true);

    const q = questions[currentIndex];
    const choices: AnswerChoice[] = (q.answer_choices ?? []) as AnswerChoice[];
    const isCorrect = choices.find(c => c.id === choiceId)?.is_correct ?? false;
    if (isCorrect) setPlayerScore(s => s + 1);

    // AI answers randomly with weighted probability
    const aiCorrectPct = 0.65;
    const aiCorrect = Math.random() < aiCorrectPct;
    if (aiCorrect) setAiScore(s => s + 1);

    const t = setTimeout(() => goToNextQuestion(), 1800);
    setAiDelay(t);
  }

  const q = questions[currentIndex];
  const choices: AnswerChoice[] = (q?.answer_choices ?? [] as AnswerChoice[]).sort((a, b) => a.sort_order - b.sort_order);
  const timePct = (timeLeft / TIME_PER_QUESTION) * 100;

  if (stage === 'lobby') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={language === 'ja' ? '対戦' : language === 'en' ? 'Battle' : 'Đối kháng'} subtitle={language === 'ja' ? '学習メニュー' : language === 'en' ? 'Study menu' : 'Thực đơn học tập'}>
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Hero */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 text-white flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">{language === 'ja' ? 'AIチャレンジ' : language === 'en' ? 'AI challenge' : 'Thử thách AI'}</h2>
              <p className="text-amber-100 text-sm">{language === 'ja' ? 'AIライバルと問題を解き合って腕試し！' : language === 'en' ? 'Test yourself by solving questions against an AI rival!' : 'Đấu với AI để kiểm tra kỹ năng của bạn!'}</p>
            </div>
            <button
              onClick={startBattle}
              className="flex items-center gap-2 px-6 py-3 bg-white text-amber-600 rounded-xl font-bold hover:bg-amber-50 transition shadow-lg"
            >
              <Zap className="w-5 h-5" />
              {language === 'ja' ? 'バトル開始' : language === 'en' ? 'Start battle' : 'Bắt đầu'}
            </button>
          </div>

          {/* Battle rules */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Trophy, label: language === 'ja' ? '出題数' : language === 'en' ? 'Questions' : 'Số câu', value: `${BATTLE_QUESTIONS}${language === 'ja' ? '問' : ''}` },
              { icon: Clock, label: language === 'ja' ? '1問あたり' : language === 'en' ? 'Per question' : 'Mỗi câu', value: `${TIME_PER_QUESTION}${language === 'ja' ? '秒' : 's'}` },
              { icon: Zap, label: language === 'ja' ? '形式' : language === 'en' ? 'Mode' : 'Chế độ', value: language === 'ja' ? 'AI対戦' : language === 'en' ? 'AI battle' : 'Đấu AI' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <Icon className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Waiting rooms */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                {language === 'ja' ? 'マッチング待ちのルーム' : language === 'en' ? 'Rooms waiting for match' : 'Phòng đang chờ ghép'}
              </h3>
              <button onClick={loadRooms} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{language === 'ja' ? '現在待機中のルームはありません' : language === 'en' ? 'No rooms are waiting right now' : 'Hiện không có phòng chờ nào'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{language === 'ja' ? 'ルーム' : language === 'en' ? 'Room' : 'Phòng'} #{room.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-400">{new Date(room.created_at).toLocaleTimeString('ja-JP')}</p>
                    </div>
                    <button
                      onClick={startBattle}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition"
                    >
                      {language === 'ja' ? '参加' : language === 'en' ? 'Join' : 'Tham gia'} <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={startBattle}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-amber-400 hover:text-amber-500 transition"
            >
              <Plus className="w-4 h-4" />
              {language === 'ja' ? '新しいルームを作成' : language === 'en' ? 'Create a new room' : 'Tạo phòng mới'}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (stage === 'result') {
    const won = playerScore > aiScore;
    const draw = playerScore === aiScore;
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={language === 'ja' ? 'バトル結果' : language === 'en' ? 'Battle result' : 'Kết quả đối kháng'} subtitle={language === 'ja' ? '対戦' : language === 'en' ? 'Battle' : 'Đối kháng'}>
        <div className="max-w-md mx-auto">
          <div className={`rounded-2xl p-8 text-center mb-5 ${won ? 'bg-amber-50 border border-amber-200' : draw ? 'bg-gray-50 border border-gray-200' : 'bg-blue-50 border border-blue-200'}`}>
            <div className="text-5xl mb-4">{won ? '🏆' : draw ? '🤝' : '😤'}</div>
            <h2 className={`text-2xl font-bold mb-2 ${won ? 'text-amber-600' : draw ? 'text-gray-600' : 'text-blue-600'}`}>
              {won ? (language === 'ja' ? '勝利！' : language === 'en' ? 'Victory!' : 'Chiến thắng!') : draw ? (language === 'ja' ? '引き分け' : language === 'en' ? 'Draw' : 'Hòa') : (language === 'ja' ? '敗北...' : language === 'en' ? 'Defeat...' : 'Thua cuộc...')}
            </h2>
            <p className="text-gray-500">{won ? (language === 'ja' ? 'AIライバルに勝利しました！' : language === 'en' ? 'You beat the AI rival!' : 'Bạn đã thắng AI!') : draw ? (language === 'ja' ? '引き分けでした！' : language === 'en' ? 'It was a draw!' : 'Hòa!') : (language === 'ja' ? 'もう一度チャレンジ！' : language === 'en' ? 'Try again!' : 'Thử lại!')}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl font-bold text-blue-600">{profile?.name?.charAt(0) ?? 'U'}</span>
                </div>
                <p className="text-sm font-semibold text-gray-700">{profile?.name ?? (language === 'ja' ? 'あなた' : language === 'en' ? 'You' : 'Bạn')}</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{playerScore}</p>
              </div>
              <div className="text-2xl font-bold text-gray-300">vs</div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center mx-auto mb-2">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm font-semibold text-gray-700">{language === 'ja' ? 'AIライバル' : language === 'en' ? 'AI rival' : 'Đối thủ AI'}</p>
                <p className="text-3xl font-bold text-purple-500 mt-1">{aiScore}</p>
              </div>
            </div>
              <p className="text-center text-xs text-gray-400 mt-4">{language === 'ja' ? `${BATTLE_QUESTIONS}問中` : language === 'en' ? `Out of ${BATTLE_QUESTIONS}` : `Trong ${BATTLE_QUESTIONS} câu`}</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStage('lobby')} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition">
              {language === 'ja' ? 'ロビーへ' : language === 'en' ? 'Back to lobby' : 'Về sảnh'}
            </button>
            <button onClick={startBattle} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition">
              {language === 'ja' ? '再挑戦' : language === 'en' ? 'Retry' : 'Thử lại'}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // Battle stage
  const selectedCorrect = answered && choices.find(c => c.id === selectedChoice)?.is_correct;

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={language === 'ja' ? 'バトル中' : language === 'en' ? 'Battle in progress' : 'Đang đối kháng'} subtitle={language === 'ja' ? '対戦' : language === 'en' ? 'Battle' : 'Đối kháng'}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Score board */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                {profile?.name?.charAt(0) ?? 'U'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">{profile?.name ?? (language === 'ja' ? 'あなた' : language === 'en' ? 'You' : 'Bạn')}</p>
                <p className="text-xl font-bold text-blue-600">{playerScore}</p>
              </div>
            </div>
            {/* Timer */}
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" strokeWidth="4" fill="none" stroke="#F3F4F6" />
                  <circle
                    cx="28" cy="28" r="22" strokeWidth="4" fill="none"
                    stroke={timeLeft <= 10 ? '#EF4444' : '#3B82F6'}
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    strokeDashoffset={`${2 * Math.PI * 22 * (1 - timePct / 100)}`}
                    className="transition-all"
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${timeLeft <= 10 ? 'text-red-500' : 'text-gray-700'}`}>
                  {timeLeft}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{language === 'ja' ? `問${currentIndex + 1}/${questions.length}` : language === 'en' ? `Q${currentIndex + 1}/${questions.length}` : `Câu ${currentIndex + 1}/${questions.length}`}</p>
            </div>
            <div className="flex items-center gap-3 flex-row-reverse">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <Zap style={{ width: 16, height: 16 }} className="text-white" />
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-700">{language === 'ja' ? 'AIライバル' : language === 'en' ? 'AI rival' : 'Đối thủ AI'}</p>
                <p className="text-xl font-bold text-purple-500">{aiScore}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full inline-block mb-4">
            {language === 'ja' ? `問題 ${currentIndex + 1}` : language === 'en' ? `Question ${currentIndex + 1}` : `Câu ${currentIndex + 1}`}
          </p>
          <p className="text-gray-800 leading-relaxed">{q?.question_text}</p>
        </div>

        {/* Choices */}
        <div className="grid grid-cols-2 gap-3">
          {choices.map((choice, idx) => {
            let cls = 'border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50/30';
            if (answered) {
              if (choice.is_correct) cls = 'border-emerald-500 bg-emerald-50';
              else if (choice.id === selectedChoice) cls = 'border-red-400 bg-red-50';
              else cls = 'border-gray-100 bg-gray-50/50 opacity-50';
            } else if (selectedChoice === choice.id) {
              cls = 'border-amber-500 bg-amber-50';
            }
            return (
              <button
                key={choice.id}
                onClick={() => handleAnswer(choice.id)}
                disabled={answered}
                className={`text-left p-4 rounded-xl border-2 transition-all ${cls} disabled:cursor-default`}
              >
                <span className="text-xs font-bold text-gray-400 block mb-1">{String.fromCharCode(65 + idx)}</span>
                <span className="text-sm text-gray-700">{choice.choice_text}</span>
                {answered && choice.is_correct && <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />}
                {answered && !choice.is_correct && choice.id === selectedChoice && <XCircle className="w-4 h-4 text-red-500 mt-1" />}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`rounded-xl p-3 text-center text-sm font-semibold ${selectedCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {selectedCorrect ? (language === 'ja' ? '正解！ +1ポイント' : language === 'en' ? 'Correct! +1 point' : 'Đúng! +1 điểm') : `${language === 'ja' ? '不正解。正解' : language === 'en' ? 'Incorrect. Correct' : 'Sai. Đáp án đúng'}: ${choices.find(c => c.is_correct)?.choice_text}`}
          </div>
        )}
      </div>
    </Layout>
  );
}
