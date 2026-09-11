import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronRight, Clock, Coins, Plus, RefreshCw, Trophy, Users, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translateMessage, translate, languageLocales } from '../i18n';
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

const DEFAULT_BATTLE_QUESTIONS = 5;
const DEFAULT_TIME_PER_QUESTION = 30;

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
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_PER_QUESTION);
  const [questionCount, setQuestionCount] = useState(DEFAULT_BATTLE_QUESTIONS);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(DEFAULT_TIME_PER_QUESTION);
  const [wager, setWager] = useState(50);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const submittingAnswer = useRef(false);
  const completingBattle = useRef(false);
  const refreshingRoom = useRef(false);
  const advanceTimer = useRef<number | undefined>(undefined);
  const activeRoomId = activeRoom?.id;
  const currentRoomId = useRef(activeRoomId);
  currentRoomId.current = activeRoomId;

  useEffect(() => () => {
    currentRoomId.current = undefined;
    window.clearTimeout(advanceTimer.current);
  }, []);

  const isCreator = activeRoom?.creator_id === profile?.id;
  const activeCreatorId = activeRoom?.creator_id;
  const activeOpponentId = activeRoom?.opponent_id;
  const opponentId = isCreator ? activeRoom?.opponent_id : activeRoom?.creator_id;
  const opponentName = opponentId ? profileNames[opponentId] ?? translate(language, 'ui.opponent') : translate(language, 'ui.opponent');
  const playerScore = isCreator ? activeRoom?.creator_score ?? 0 : activeRoom?.opponent_score ?? 0;
  const opponentScore = isCreator ? activeRoom?.opponent_score ?? 0 : activeRoom?.creator_score ?? 0;
  const question = questions[currentIndex];
  const choices: AnswerChoice[] = useMemo(
    () => [...(question?.answer_choices ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [question],
  );
  const selectedCorrect = answered && choices.find(choice => choice.id === selectedChoiceId)?.is_correct;
  const roomTimeLimit = activeRoom?.time_per_question_seconds ?? DEFAULT_TIME_PER_QUESTION;
  const timePct = (timeLeft / roomTimeLimit) * 100;
  const isValidWager = Number.isInteger(wager) && wager >= 0;

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
      .or(profile?.id
        ? `status.eq.waiting,and(status.eq.active,creator_id.eq.${profile.id}),and(status.eq.active,opponent_id.eq.${profile.id})`
        : 'status.eq.waiting')
      .order('created_at', { ascending: false })
      .limit(10);
    if (roomError) {
      setError(roomError.message);
      return;
    }
    const availableRooms = (data ?? []) as BattleRoom[];
    setRooms(availableRooms);
    void loadProfileNames(availableRooms.map(room => room.creator_id));
  }, [loadProfileNames, profile?.id]);

  const loadRoomAnswers = useCallback(async (roomId: string) => {
    const { data, error: answerError } = await supabase
      .from('battle_answers')
      .select('user_id, question_id, selected_choice_id, is_correct')
      .eq('room_id', roomId);
    if (answerError) throw answerError;
    if (currentRoomId.current === roomId) setAnswers((data ?? []) as BattleAnswerRow[]);
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
    if (questionIds.some(id => !byId.has(id))) throw new Error('Some battle questions are unavailable. Please retry.');
    if (currentRoomId.current === room.id) setQuestions(questionIds.map(id => byId.get(id) as Question));
  }, []);

  const refreshActiveRoom = useCallback(async () => {
    if (!activeRoomId || refreshingRoom.current) return;
    refreshingRoom.current = true;
    try {
      const { data, error: roomError } = await supabase
        .from('battle_rooms')
        .select('*')
        .eq('id', activeRoomId)
        .single();
      if (roomError) {
        setError(roomError.message);
        return;
      }

      if (currentRoomId.current !== activeRoomId) return;
      const room = data as BattleRoom;
      setActiveRoom(room);
      void loadProfileNames([room.creator_id, room.opponent_id]);

      if (room.status === 'active' && stage === 'waiting') {
        try {
          await loadQuestionsForRoom(room);
          const savedAnswers = await loadRoomAnswers(room.id);
          if (currentRoomId.current !== room.id) return;
          const nextIndex = room.question_ids.findIndex(id => !savedAnswers.some(answer => answer.user_id === profile?.id && answer.question_id === id));
          setCurrentIndex(nextIndex < 0 ? room.question_ids.length - 1 : nextIndex);
          setSelectedChoiceId(null);
          setAnswered(false);
          setWaitingForOpponent(nextIndex < 0);
          setTimeLeft(room.time_per_question_seconds ?? DEFAULT_TIME_PER_QUESTION);
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
        if (!room.opponent_id) {
          setActiveRoom(null);
          setStage('lobby');
          void loadRooms();
        } else setStage('result');
        await loadBalance();
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh battle room.');
    } finally {
      refreshingRoom.current = false;
    }
  }, [activeRoomId, loadBalance, loadProfileNames, loadQuestionsForRoom, loadRoomAnswers, loadRooms, profile?.id, stage]);

  const refreshRoomRef = useRef(refreshActiveRoom);
  refreshRoomRef.current = refreshActiveRoom;

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
    if (!isSupabaseEnabled || !activeRoomId) return;
    const refresh = () => { void refreshRoomRef.current(); };
    refresh();
    const interval = window.setInterval(refresh, 2500);
    const channel = supabase
      .channel(`battle-room-${activeRoomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'battle_rooms', filter: `id=eq.${activeRoomId}`,
      }, refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'battle_answers', filter: `room_id=eq.${activeRoomId}`,
      }, refresh)
      .subscribe();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(advanceTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (stage !== 'lobby') return;
    const interval = window.setInterval(() => { void loadRooms(); }, 5000);
    return () => window.clearInterval(interval);
  }, [loadRooms, stage]);

  const maybeCompleteBattle = useCallback(async (room: BattleRoom, answerRows: BattleAnswerRow[]) => {
    if (!profile || !room.opponent_id) return;
    const total = room.question_ids.length;
    const creatorDone = answerRows.filter(answer => answer.user_id === room.creator_id).length >= total;
    const opponentDone = answerRows.filter(answer => answer.user_id === room.opponent_id).length >= total;
    if (!creatorDone || !opponentDone) {
      setWaitingForOpponent(true);
      return;
    }

    if (completingBattle.current || currentRoomId.current !== room.id) return;
    completingBattle.current = true;
    try {
      const completed = await completeOnlineBattleRoom(room.id);
      if (currentRoomId.current !== room.id) return;
      setActiveRoom(completed);
      setStage('result');
      await loadBalance();
    } catch (completionError) {
      setWaitingForOpponent(true);
      setError(completionError instanceof Error ? completionError.message : 'Unable to settle battle. Retrying...');
    } finally {
      completingBattle.current = false;
    }
  }, [loadBalance, profile]);

  const resetQuestionState = useCallback((index: number) => {
    const nextIndex = questions.findIndex((item, questionIndex) => questionIndex >= index
      && !answers.some(answer => answer.user_id === profile?.id && answer.question_id === item.id));
    if (nextIndex < 0) {
      setWaitingForOpponent(true);
      return;
    }
    setCurrentIndex(nextIndex);
    setSelectedChoiceId(null);
    setAnswered(false);
    setTimeLeft(roomTimeLimit);
  }, [answers, profile?.id, questions, roomTimeLimit]);

  useEffect(() => {
    if (waitingForOpponent && activeRoom?.status === 'active') {
      void maybeCompleteBattle(activeRoom, answers);
    }
  }, [activeRoom, answers, maybeCompleteBattle, waitingForOpponent]);

  async function createRoom() {
    if (!profile || !isValidWager) return;
    if (!isSupabaseEnabled) {
      setError('Online battle rooms require Supabase to be enabled.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const room = await createOnlineBattleRoom(Math.max(0, Math.round(wager)), questionCount, secondsPerQuestion);
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
      setStage('waiting');
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

  const handleAnswer = useCallback(async (choiceId: string | null) => {
    if (!activeRoom || !question || answered || submittingAnswer.current) return;
    submittingAnswer.current = true;
    let persisted = false;
    setSelectedChoiceId(choiceId);
    setAnswered(true);
    setError('');
    try {
      const room = await submitOnlineBattleAnswer(activeRoom.id, question.id, choiceId);
      persisted = true;
      if (currentRoomId.current !== room.id) return;
      setActiveRoom(room);
      advanceTimer.current = window.setTimeout(() => {
        if (currentRoomId.current !== room.id) return;
        if (currentIndex + 1 < questions.length) resetQuestionState(currentIndex + 1);
        else setWaitingForOpponent(true);
      }, 1000);
      // Answer persistence succeeded; a failed refresh must not block progression.
      await loadRoomAnswers(room.id);
    } catch (answerError) {
      if (currentRoomId.current !== activeRoom.id) return;
      setError(answerError instanceof Error ? answerError.message : 'Unable to submit battle answer. Please retry.');
      if (!persisted) {
        setAnswered(false);
        setSelectedChoiceId(null);
        setTimeLeft(value => Math.max(value, 5));
      }
    } finally {
      submittingAnswer.current = false;
    }
  }, [activeRoom, answered, currentIndex, loadRoomAnswers, question, questions.length, resetQuestionState]);

  useEffect(() => {
    if (stage !== 'battle' || answered || waitingForOpponent) return;
    if (timeLeft <= 0) {
      void handleAnswer(null);
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [answered, handleAnswer, stage, timeLeft, waitingForOpponent]);

  if (stage === 'lobby') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battle')} subtitle={translate(language, 'battlePage.studyMenu')}>
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{translate(language, 'ui.onlineRooms')}</h2>
                <p className="text-sm text-gray-500 mt-1">{translate(language, 'ui.roomIntro')}</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-amber-700">
                <Coins className="w-5 h-5" />
                <span className="text-sm font-bold">{translate(language, 'ui.pointAmount', { count: balance.toLocaleString(languageLocales[language]) })}</span>
              </div>
            </div>
            {!isSupabaseEnabled && (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                {translate(language, 'ui.onlineRequired')}
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{translateMessage(language, error)}</div>}

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Trophy, label: translate(language, 'ui.questions'), value: `${questionCount}` },
              { icon: Clock, label: translate(language, 'ui.perQuestion'), value: translate(language, 'ui.seconds', { count: secondsPerQuestion }) },
              { icon: Coins, label: translate(language, 'ui.defaultWager'), value: isValidWager ? translate(language, 'ui.pointAmount', { count: wager }) : '—' },
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
                {translate(language, 'ui.availableRooms')}
              </h3>
              <button onClick={loadRooms} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{translate(language, 'ui.noRooms')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{translate(language, 'ui.room', { id: room.id.slice(0, 8) })}</p>
                      <p className="text-xs text-gray-400">
                        {translate(language, 'ui.roomRules', { count: room.question_ids.length, seconds: room.time_per_question_seconds ?? DEFAULT_TIME_PER_QUESTION })} | {profileNames[room.creator_id] ?? translate(language, 'ui.waitingPlayer')} | {translate(language, 'ui.pointAmount', { count: room.wager_points.toLocaleString(languageLocales[language]) })} | {new Date(room.created_at).toLocaleTimeString(languageLocales[language])}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (room.creator_id === profile?.id || room.opponent_id === profile?.id) {
                          setActiveRoom(room);
                          setStage('waiting');
                        } else void joinRoom(room.id);
                      }}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition disabled:opacity-40"
                    >
                      {room.creator_id === profile?.id || room.opponent_id === profile?.id ? translate(language, 'ui.resume') : translate(language, 'ui.join')} <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-gray-500">
                {translate(language, 'ui.battleCount')}
                <input type="number" min={1} max={20} step={1} value={Number.isNaN(questionCount) ? '' : questionCount}
                  onChange={event => setQuestionCount(event.target.valueAsNumber)} disabled={loading}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs font-semibold text-gray-500">
                {translate(language, 'ui.battleSeconds')}
                <input type="number" min={5} max={300} step={1} value={Number.isNaN(secondsPerQuestion) ? '' : secondsPerQuestion}
                  onChange={event => setSecondsPerQuestion(event.target.valueAsNumber)} disabled={loading}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500">{translate(language, 'ui.wager')}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isNaN(wager) ? '' : wager}
                  onChange={event => setWager(event.target.valueAsNumber)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <button
                onClick={() => void createRoom()}
                disabled={loading || !isSupabaseEnabled || !isValidWager || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20 || !Number.isInteger(secondsPerQuestion) || secondsPerQuestion < 5 || secondsPerQuestion > 300}
                className="self-end flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {translate(language, 'ui.createRoom')}
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (stage === 'waiting') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'ui.waitingOpponent')} subtitle={translate(language, 'battlePage.battle')}>
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800">{translate(language, 'ui.room', { id: activeRoom?.id.slice(0, 8) ?? '' })}</h2>
          <p className="text-sm text-gray-500 mt-2">{translate(language, 'ui.wagerLocked', { count: activeRoom?.wager_points.toLocaleString(languageLocales[language]) ?? 0 })}</p>
          <p className="text-sm text-gray-500 mt-2">{translate(language, 'ui.roomRules', { count: activeRoom?.question_ids.length ?? 0, seconds: roomTimeLimit })}</p>
          <p className="text-sm text-gray-400 mt-4">{translate(language, 'ui.keepOpen')}</p>
          {error && <p className="text-sm text-red-500 mt-4">{translateMessage(language, error)}</p>}
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => void refreshActiveRoom()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-50"
            >
              {translate(language, 'ui.checkRoom')}
            </button>
            <button
              onClick={() => void cancelRoom()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              {translate(language, 'ui.cancelRefund')}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (stage === 'result') {
    const won = activeRoom?.winner_id === profile?.id;
    const draw = activeRoom?.winner_id === null;
    const wagerPoints = activeRoom?.wager_points ?? 0;
    const pointsAdded = draw ? wagerPoints : won ? wagerPoints * 2 : 0;
    const pointsDeducted = draw || won ? 0 : wagerPoints;
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleResult')} subtitle={translate(language, 'battlePage.battle')}>
        <div className="max-w-md mx-auto space-y-5">
          <div className={`rounded-2xl p-8 text-center ${won ? 'bg-amber-50 border border-amber-200' : draw ? 'bg-gray-50 border border-gray-200' : 'bg-blue-50 border border-blue-200'}`}>
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${won ? 'text-amber-500' : draw ? 'text-gray-400' : 'text-blue-500'}`} />
            <h2 className={`text-2xl font-bold mb-2 ${won ? 'text-amber-600' : draw ? 'text-gray-600' : 'text-blue-600'}`}>
              {won ? translate(language, 'ui.victory') : draw ? translate(language, 'ui.draw') : translate(language, 'ui.defeat')}
            </h2>
            <p className="text-gray-500">
              {draw ? translate(language, 'ui.drawRefund') : won ? translate(language, 'ui.wonWager') : translate(language, 'ui.lostWager')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{profile?.name ?? translate(language, 'ui.you')}</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{playerScore}</p>
              </div>
              <div className="text-2xl font-bold text-gray-300">{translate(language, 'ui.versus')}</div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{opponentName}</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{opponentScore}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-emerald-700">{translate(language, 'ui.pointsAdded')}</p>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">
                  +{pointsAdded.toLocaleString(languageLocales[language])}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-red-700">{translate(language, 'ui.pointsDeducted')}</p>
                <p className="text-lg font-bold text-red-600 mt-0.5">
                  -{pointsDeducted.toLocaleString(languageLocales[language])}
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-4">{translate(language, 'ui.balance', { count: balance.toLocaleString(languageLocales[language]) })}</p>
          </div>

          <button onClick={() => { setStage('lobby'); setActiveRoom(null); void loadRooms(); void loadBalance(); }} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition">
            {translate(language, 'ui.backLobby')}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleInProgress')} subtitle={translate(language, 'battlePage.battle')}>
      <div className="max-w-2xl mx-auto space-y-4">
        {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">{translateMessage(language, error)}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">{profile?.name ?? translate(language, 'ui.you')}</p>
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
            <h2 className="text-xl font-bold text-gray-800">{translate(language, 'ui.waitingFinish')}</h2>
            <p className="text-sm text-gray-500 mt-2">{translate(language, 'ui.settleHelp')}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full inline-block mb-4">
                {translate(language, 'ui.questionNumber', { count: currentIndex + 1 })}
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
                {selectedCorrect ? translate(language, 'ui.correct') : translate(language, 'ui.incorrect', { answer: choices.find(choice => choice.is_correct)?.choice_text ?? '' })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
