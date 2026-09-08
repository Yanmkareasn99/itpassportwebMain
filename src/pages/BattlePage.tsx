import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, ChevronRight, Clock, Coins, Plus, RefreshCw, Trophy, Users, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translate, languageLocales } from '../i18n';
import { AnswerChoice, BattleRoom, Page, Question } from '../types';
import { AnswerChoiceContent, QuestionImage } from '../components/QuestionMedia';
import {
  cancelOnlineBattleRoom,
  completeOnlineBattleRoom,
  createOnlineBattleRoom,
  getPointBalance,
  joinOnlineBattleRoom,
  submitOnlineBattleAnswer,
} from '../lib/points';

interface BattlePageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const BATTLE_QUESTIONS = 5;
const TIME_PER_QUESTION = 30;

type BattleStage = 'lobby' | 'waiting' | 'battle' | 'result';

type BattleAnswerRow = {
  user_id: string;
  question_id: string;
  selected_choice_id: string | null;
  is_correct: boolean;
};

type BattleProfileName = {
  id: string;
  name: string;
};

export default function BattlePage({ currentPage, onNavigate }: BattlePageProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const [stage, setStage] = useState<BattleStage>('lobby');
  const [rooms, setRooms] = useState<BattleRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<BattleRoom | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<BattleAnswerRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [wager, setWager] = useState(50);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const isCreator = activeRoom?.creator_id === profile?.id;
  const activeCreatorId = activeRoom?.creator_id;
  const activeOpponentId = activeRoom?.opponent_id;
  const opponentId = isCreator ? activeRoom?.opponent_id : activeRoom?.creator_id;
  const opponentName = opponentId ? profileNames[opponentId] ?? 'Opponent' : 'Opponent';
  const playerScore = isCreator ? activeRoom?.creator_score ?? 0 : activeRoom?.opponent_score ?? 0;
  const opponentScore = isCreator ? activeRoom?.opponent_score ?? 0 : activeRoom?.creator_score ?? 0;
  const question = questions[currentIndex];
  const choices: AnswerChoice[] = useMemo(
    () => [...(question?.answer_choices ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [question],
  );
  const selectedCorrect = answered && choices.find(choice => choice.id === selectedChoiceId)?.is_correct;
  const timePct = (timeLeft / TIME_PER_QUESTION) * 100;

  const loadBalance = useCallback(async () => {
    if (!profile) return;
    try {
      const points = await getPointBalance(profile.id);
      setBalance(points.balance);
    } catch (balanceError) {
      setError(balanceError instanceof Error ? balanceError.message : 'Unable to load points.');
    }
  }, [profile]);

  const loadProfileNames = useCallback(async (ids: Array<string | null | undefined>) => {
    const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (uniqueIds.length === 0) return;

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', uniqueIds);

    if (profileError) {
      console.warn('Failed to load battle profile names:', profileError.message);
      return;
    }

    setProfileNames(current => ({
      ...current,
      ...Object.fromEntries(((data ?? []) as BattleProfileName[]).map(item => [item.id, item.name])),
    }));
  }, []);

  const loadRooms = useCallback(async () => {
    if (!isSupabaseEnabled) return;
    setError('');
    const { data, error: roomError } = await supabase
      .from('battle_rooms')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(10);
    if (roomError) {
      setError(roomError.message);
      return;
    }
    const waitingRooms = (data ?? []) as BattleRoom[];
    setRooms(waitingRooms);
    void loadProfileNames(waitingRooms.map(room => room.creator_id));
  }, [loadProfileNames]);

  const loadRoomAnswers = useCallback(async (roomId: string) => {
    const { data, error: answerError } = await supabase
      .from('battle_answers')
      .select('user_id, question_id, selected_choice_id, is_correct')
      .eq('room_id', roomId);
    if (answerError) throw answerError;
    setAnswers((data ?? []) as BattleAnswerRow[]);
    return (data ?? []) as BattleAnswerRow[];
  }, []);

  const loadQuestionsForRoom = useCallback(async (room: BattleRoom) => {
    const questionIds = room.question_ids ?? [];
    if (questionIds.length === 0) throw new Error('This battle room has no questions.');

    const { data, error: questionError } = await supabase
      .from('questions')
      .select('*, answer_choices(*)')
      .in('id', questionIds);
    if (questionError) throw questionError;

    const byId = new Map((data ?? []).map(item => [item.id, item as Question]));
    setQuestions(questionIds.map(id => byId.get(id)).filter(Boolean) as Question[]);
  }, []);

  const refreshActiveRoom = useCallback(async () => {
    if (!activeRoom) return;
    const { data, error: roomError } = await supabase
      .from('battle_rooms')
      .select('*')
      .eq('id', activeRoom.id)
      .single();
    if (roomError) {
      setError(roomError.message);
      return;
    }

    const room = data as BattleRoom;
    setActiveRoom(room);
    void loadProfileNames([room.creator_id, room.opponent_id]);

    if (room.status === 'active' && stage === 'waiting') {
      try {
        await loadQuestionsForRoom(room);
        setCurrentIndex(0);
        setSelectedChoiceId(null);
        setAnswered(false);
        setWaitingForOpponent(false);
        setTimeLeft(TIME_PER_QUESTION);
        setStage('battle');
      } catch (questionError) {
        setError(questionError instanceof Error ? questionError.message : 'Unable to load battle questions.');
        return;
      }
    }

    try {
      await loadRoomAnswers(room.id);
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : 'Unable to load battle answers.');
    }

    if (room.status === 'completed') {
      setStage('result');
      await loadBalance();
    }
  }, [activeRoom, loadBalance, loadProfileNames, loadQuestionsForRoom, loadRoomAnswers, stage]);

  useEffect(() => {
    void loadRooms();
    void loadBalance();
  }, [loadBalance, loadRooms]);

  useEffect(() => {
    if (profile) {
      setProfileNames(current => ({ ...current, [profile.id]: profile.name }));
    }
  }, [profile]);

  useEffect(() => {
    if (activeCreatorId || activeOpponentId) {
      void loadProfileNames([activeCreatorId, activeOpponentId]);
    }
  }, [activeCreatorId, activeOpponentId, loadProfileNames]);

  useEffect(() => {
    if (!isSupabaseEnabled || !activeRoom) return;

    const interval = window.setInterval(() => {
      void refreshActiveRoom();
    }, 2500);

    const channel = supabase
      .channel(`battle-room-${activeRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'battle_rooms',
        filter: `id=eq.${activeRoom.id}`,
      }, () => {
        void refreshActiveRoom();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'battle_answers',
        filter: `room_id=eq.${activeRoom.id}`,
      }, () => {
        void loadRoomAnswers(activeRoom.id);
      })
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [activeRoom, loadRoomAnswers, refreshActiveRoom]);

  const maybeCompleteBattle = useCallback(async (room: BattleRoom, answerRows: BattleAnswerRow[]) => {
    if (!profile || !room.opponent_id) return;
    const total = room.question_ids.length;
    const creatorDone = answerRows.filter(answer => answer.user_id === room.creator_id).length >= total;
    const opponentDone = answerRows.filter(answer => answer.user_id === room.opponent_id).length >= total;
    if (!creatorDone || !opponentDone) {
      setWaitingForOpponent(true);
      return;
    }

    const completed = await completeOnlineBattleRoom(room.id);
    setActiveRoom(completed);
    setStage('result');
    await loadBalance();
  }, [loadBalance, profile]);

  const resetQuestionState = useCallback((index: number) => {
    const alreadyAnswered = answers.find(answer => answer.user_id === profile?.id && answer.question_id === questions[index]?.id);
    setCurrentIndex(index);
    setSelectedChoiceId(alreadyAnswered?.selected_choice_id ?? null);
    setAnswered(Boolean(alreadyAnswered));
    setTimeLeft(TIME_PER_QUESTION);
  }, [answers, profile?.id, questions]);

  const goToNextQuestion = useCallback(async () => {
    if (!activeRoom) return;
    if (currentIndex + 1 < questions.length) {
      resetQuestionState(currentIndex + 1);
      return;
    }
    const latestAnswers = await loadRoomAnswers(activeRoom.id);
    await maybeCompleteBattle(activeRoom, latestAnswers);
  }, [activeRoom, currentIndex, loadRoomAnswers, maybeCompleteBattle, questions.length, resetQuestionState]);

  useEffect(() => {
    if (waitingForOpponent && activeRoom?.status === 'active') {
      void maybeCompleteBattle(activeRoom, answers);
    }
  }, [activeRoom, answers, maybeCompleteBattle, waitingForOpponent]);

  useEffect(() => {
    if (stage !== 'battle' || answered || waitingForOpponent) return;
    if (timeLeft <= 0) {
      void goToNextQuestion();
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [answered, goToNextQuestion, stage, timeLeft, waitingForOpponent]);

  async function createRoom() {
    if (!profile) return;
    if (!isSupabaseEnabled) {
      setError('Online battle rooms require Supabase to be enabled.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const room = await createOnlineBattleRoom(Math.max(0, Math.round(wager)), BATTLE_QUESTIONS);
      setActiveRoom(room);
      void loadProfileNames([room.creator_id]);
      setQuestions([]);
      setAnswers([]);
      setStage('waiting');
      await loadBalance();
      await loadRooms();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create battle room.');
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(roomId: string) {
    setLoading(true);
    setError('');
    try {
      const room = await joinOnlineBattleRoom(roomId);
      setActiveRoom(room);
      void loadProfileNames([room.creator_id, room.opponent_id]);
      await loadQuestionsForRoom(room);
      await loadRoomAnswers(room.id);
      setCurrentIndex(0);
      setSelectedChoiceId(null);
      setAnswered(false);
      setWaitingForOpponent(false);
      setTimeLeft(TIME_PER_QUESTION);
      setStage('battle');
      await loadBalance();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Unable to join battle room.');
    } finally {
      setLoading(false);
    }
  }

  async function cancelRoom() {
    if (!activeRoom) return;
    setLoading(true);
    setError('');
    try {
      await cancelOnlineBattleRoom(activeRoom.id);
      setActiveRoom(null);
      setStage('lobby');
      await loadBalance();
      await loadRooms();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel battle room.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswer(choiceId: string) {
    if (!activeRoom || !question || answered) return;
    setSelectedChoiceId(choiceId);
    setAnswered(true);
    setError('');
    try {
      const room = await submitOnlineBattleAnswer(activeRoom.id, question.id, choiceId);
      setActiveRoom(room);
      void loadProfileNames([room.creator_id, room.opponent_id]);
      const latestAnswers = await loadRoomAnswers(room.id);
      window.setTimeout(() => {
        if (currentIndex + 1 < questions.length) resetQuestionState(currentIndex + 1);
        else void maybeCompleteBattle(room, latestAnswers);
      }, 1000);
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : 'Unable to submit battle answer.');
    }
  }

  if (stage === 'lobby') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battle')} subtitle={translate(language, 'battlePage.studyMenu')}>
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Online Battle Rooms</h2>
                <p className="text-sm text-gray-500 mt-1">Create or join a room, wager points, and answer the same questions against another online user.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-amber-700">
                <Coins className="w-5 h-5" />
                <span className="text-sm font-bold">{balance.toLocaleString()} pts</span>
              </div>
            </div>
            {!isSupabaseEnabled && (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                Online user-vs-user battle needs Supabase enabled because rooms, wagers, and realtime updates live in the database.
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{error}</div>}

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Trophy, label: 'Questions', value: `${BATTLE_QUESTIONS}` },
              { icon: Clock, label: 'Per question', value: `${TIME_PER_QUESTION}s` },
              { icon: Coins, label: 'Default wager', value: `${wager} pts` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <Icon className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                Waiting Rooms
              </h3>
              <button onClick={loadRooms} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No rooms are waiting right now.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Room #{room.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-400">
                        {profileNames[room.creator_id] ?? 'Waiting player'} | {room.wager_points.toLocaleString()} pts wager | {new Date(room.created_at).toLocaleTimeString(languageLocales[language])}
                      </p>
                    </div>
                    <button
                      onClick={() => void joinRoom(room.id)}
                      disabled={loading || room.creator_id === profile?.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition disabled:opacity-40"
                    >
                      Join <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500">Wager points</span>
                <input
                  type="number"
                  min={0}
                  value={wager}
                  onChange={event => setWager(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <button
                onClick={() => void createRoom()}
                disabled={loading || !isSupabaseEnabled}
                className="self-end flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Create Room
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (stage === 'waiting') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title="Waiting for Opponent" subtitle={translate(language, 'battlePage.battle')}>
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800">Room #{activeRoom?.id.slice(0, 8)}</h2>
          <p className="text-sm text-gray-500 mt-2">Wager locked: {activeRoom?.wager_points.toLocaleString() ?? 0} pts</p>
          <p className="text-sm text-gray-400 mt-4">Keep this page open. The battle starts when another user joins.</p>
          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => void refreshActiveRoom()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-50"
            >
              Check Room
            </button>
            <button
              onClick={() => void cancelRoom()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              Cancel and Refund
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (stage === 'result') {
    const won = activeRoom?.winner_id === profile?.id;
    const draw = activeRoom?.winner_id === null;
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleResult')} subtitle={translate(language, 'battlePage.battle')}>
        <div className="max-w-md mx-auto space-y-5">
          <div className={`rounded-2xl p-8 text-center ${won ? 'bg-amber-50 border border-amber-200' : draw ? 'bg-gray-50 border border-gray-200' : 'bg-blue-50 border border-blue-200'}`}>
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${won ? 'text-amber-500' : draw ? 'text-gray-400' : 'text-blue-500'}`} />
            <h2 className={`text-2xl font-bold mb-2 ${won ? 'text-amber-600' : draw ? 'text-gray-600' : 'text-blue-600'}`}>
              {won ? 'Victory' : draw ? 'Draw' : 'Defeat'}
            </h2>
            <p className="text-gray-500">
              {draw ? 'Both wagers were refunded.' : won ? 'You won the battle wager.' : 'The opponent won this room.'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{profile?.name ?? 'You'}</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{playerScore}</p>
              </div>
              <div className="text-2xl font-bold text-gray-300">vs</div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{opponentName}</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{opponentScore}</p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-4">Balance: {balance.toLocaleString()} pts</p>
          </div>

          <button onClick={() => { setStage('lobby'); setActiveRoom(null); void loadRooms(); void loadBalance(); }} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition">
            Back to Lobby
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleInProgress')} subtitle={translate(language, 'battlePage.battle')}>
      <div className="max-w-2xl mx-auto space-y-4">
        {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{error}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">{profile?.name ?? 'You'}</p>
              <p className="text-xl font-bold text-blue-600">{playerScore}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" strokeWidth="4" fill="none" stroke="#F3F4F6" />
                  <circle cx="28" cy="28" r="22" strokeWidth="4" fill="none" stroke={timeLeft <= 10 ? '#EF4444' : '#3B82F6'} strokeDasharray={`${2 * Math.PI * 22}`} strokeDashoffset={`${2 * Math.PI * 22 * (1 - timePct / 100)}`} />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${timeLeft <= 10 ? 'text-red-500' : 'text-gray-700'}`}>{timeLeft}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{currentIndex + 1} / {questions.length}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-700">{opponentName}</p>
              <p className="text-xl font-bold text-amber-600">{opponentScore}</p>
            </div>
          </div>
        </div>

        {waitingForOpponent ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800">Waiting for opponent to finish</h2>
            <p className="text-sm text-gray-500 mt-2">The result will settle automatically when both players answer all questions.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full inline-block mb-4">
                Question {currentIndex + 1}
              </p>
              <p className="text-gray-800 leading-relaxed whitespace-pre-line">{question?.question_text}</p>
              <QuestionImage question={question} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {choices.map((choice, idx) => {
                let cls = 'border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50/30';
                if (answered) {
                  if (choice.is_correct) cls = 'border-emerald-500 bg-emerald-50';
                  else if (choice.id === selectedChoiceId) cls = 'border-red-400 bg-red-50';
                  else cls = 'border-gray-100 bg-gray-50/50 opacity-50';
                }
                return (
                  <button
                    key={choice.id}
                    onClick={() => void handleAnswer(choice.id)}
                    disabled={answered}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${cls} disabled:cursor-default`}
                  >
                    <span className="text-xs font-bold text-gray-400 block mb-1">{String.fromCharCode(65 + idx)}</span>
                    <AnswerChoiceContent question={question} choice={choice} displayIndex={idx} />
                    {answered && choice.is_correct && <CheckCircle className="w-4 h-4 text-emerald-500 mt-1" />}
                    {answered && !choice.is_correct && choice.id === selectedChoiceId && <XCircle className="w-4 h-4 text-red-500 mt-1" />}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div className={`rounded-xl p-3 text-center text-sm font-semibold ${selectedCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {selectedCorrect ? 'Correct' : `Incorrect. Correct answer: ${choices.find(choice => choice.is_correct)?.choice_text ?? ''}`}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
