import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, Coins, Flame, Gamepad2, Lightbulb, ListChecks, RefreshCw, RotateCcw, Sparkles, Swords, Tag, Timer, Trophy, User, Users, XCircle, Zap } from 'lucide-react';
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
import { fetchBattleRankings, type BattleRankingRow } from '../lib/battleRanking';
import { loadQuestionsByIds } from '../lib/practice';

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

// ---- Shared style tokens (light = white, dark = deep navy) ----
const panel = 'rounded-3xl bg-white ring-1 ring-indigo-100 shadow-[0_2px_14px_rgba(99,102,241,0.08)] dark:bg-[#0f1530] dark:ring-indigo-400/15 dark:shadow-none';
const inner = 'rounded-2xl bg-[#f8f7ff] ring-1 ring-indigo-100 dark:bg-white/5 dark:ring-indigo-300/15';
const strong = 'text-indigo-950 dark:text-white';
const mute = 'text-slate-500 dark:text-slate-400';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-3 text-sm font-bold text-white transition hover:from-violet-500 hover:to-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-[#0f1530]';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-full bg-indigo-50 px-6 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15';

// Strings for the new "join by code" card (add to your i18n files if you prefer).
const LOCAL_TEXT: Record<string, { joinTitle: string; joinHelp: string; codePlaceholder: string; joinBtn: string; codeNotFound: string; replay: string; playNext: string; hint: string }> = {
  vi: { joinTitle: 'Tham gia phòng đấu', joinHelp: 'Nhập mã phòng để tham gia trận đấu của người khác.', codePlaceholder: 'Nhập mã phòng...', joinBtn: 'Tham gia', codeNotFound: 'Không tìm thấy phòng với mã này.', replay: 'Chơi lại', playNext: 'Chơi tiếp', hint: 'Hãy ôn lại các câu hỏi chưa đúng rồi thử lại nhé!' },
  en: { joinTitle: 'Join a battle room', joinHelp: "Enter a room code to join someone else's battle.", codePlaceholder: 'Enter room code...', joinBtn: 'Join', codeNotFound: 'No room found with this code.', replay: 'Play again', playNext: 'Play next', hint: 'Review the questions you missed and try again!' },
  ja: { joinTitle: 'ルームに参加', joinHelp: 'ルームコードを入力して対戦に参加しましょう。', codePlaceholder: 'ルームコードを入力...', joinBtn: '参加', codeNotFound: 'このコードのルームが見つかりません。', replay: 'もう一度', playNext: '続ける', hint: '間違えた問題を復習して、もう一度挑戦しよう！' },
};

function CrownIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <path d="M92 405 40 225l120-3 96-122v305z" fill="#FFD000" />
      <path d="M256 100l96 122 120 3-52 180H256z" fill="#FFBA00" />
      <path d="M92 405h164v60H106a14 14 0 0 1-14-14z" fill="#FFBA00" />
      <path d="M256 405h164v46a14 14 0 0 1-14 14H256z" fill="#FFA000" />
      <circle cx="45" cy="180" r="45" fill="#FFBA00" />
      <circle cx="256" cy="90" r="45" fill="#FFBA00" />
      <path d="M256 45a45 45 0 0 1 0 90z" fill="#FFA000" />
      <circle cx="467" cy="180" r="45" fill="#FFA000" />
      <path d="M256 248l14 33 35 3-26 23 8 35-31-18-31 18 8-35-27-23 35-3z" fill="#FF8F00" />
    </svg>
  );
}

const gradientText = 'bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent dark:from-sky-300 dark:via-indigo-300 dark:to-violet-300';

const CONFETTI = [
  'left-[10%] top-10 rotate-45 bg-violet-400',
  'left-[18%] top-24 -rotate-12 bg-amber-300',
  'right-[12%] top-8 rotate-12 bg-sky-400',
  'right-[8%] top-28 -rotate-45 bg-violet-300',
  'right-[22%] top-40 rotate-45 bg-amber-300',
  'left-[6%] top-44 rotate-12 bg-sky-300',
];

function PlayerCard({ name, score, crown, highlight, framed, stacked, smallCrown }: {
  name: string; score: number; crown?: boolean; highlight?: boolean; framed?: boolean; stacked?: boolean; smallCrown?: boolean;
}) {
  const frame = framed
    ? `relative rounded-2xl p-4 ${highlight ? 'bg-indigo-50 ring-2 ring-violet-400 dark:bg-indigo-500/15' : 'bg-white ring-1 ring-indigo-100 dark:bg-[#0f1530] dark:ring-indigo-400/15'}`
    : '';
  return (
    <div className={`flex min-w-0 items-center gap-3 ${stacked ? 'flex-col text-center' : ''} ${frame}`}>
      {framed && crown && <CrownIcon className="absolute -top-4 left-1/2 h-7 w-7 -translate-x-1/2" />}
      <span className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 ring-4 ${highlight ? 'ring-violet-400/50' : 'opacity-70 ring-indigo-300/20'}`}>
        {!framed && crown && (
          <CrownIcon
            className={`absolute left-1/2 -translate-x-1/2 ${smallCrown ? '-top-3.5 h-5 w-5' : '-top-5 h-7 w-7'}`}
          />
        )}
        <User className="h-8 w-8 text-white" />
      </span>
      <div className={`min-w-0 ${stacked ? 'text-center' : 'text-left'}`}>
        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{name}</p>
        <p className={`text-4xl font-black tabular-nums ${highlight ? 'text-indigo-950 dark:text-white' : 'text-slate-400 dark:text-slate-400'}`}>{score}</p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, tint, label, value }: { icon: typeof Timer; tint: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 px-2">
      <Icon className={`h-6 w-6 shrink-0 ${tint}`} />
      <div className="min-w-0 text-left">
        <p className="truncate text-sm font-extrabold tabular-nums text-slate-800 dark:text-white">{value}</p>
        <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

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
  const [rankings, setRankings] = useState<BattleRankingRow[]>([]);
  const [rankingLoading, setRankingLoading] = useState(isSupabaseEnabled);
  const [rankingError, setRankingError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const createCardRef = useRef<HTMLElement>(null);

  const submittingAnswer = useRef(false);
  const completingBattle = useRef(false);
  const refreshingRoom = useRef(false);
  const creatingRoom = useRef(false);
  const cancellingRoom = useRef(false);
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
  const isValidWager = Number.isInteger(wager) && wager >= 0 && wager <= balance;
  const hasInsufficientBalance = Number.isFinite(wager) && wager > balance;

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

  const loadRankings = useCallback(async () => {
    if (!isSupabaseEnabled) return;
    setRankingLoading(true);
    setRankingError('');
    try {
      setRankings(await fetchBattleRankings());
    } catch (rankingLoadError) {
      setRankingError(rankingLoadError instanceof Error
        ? rankingLoadError.message
        : 'Unable to load battle rankings.');
    } finally {
      setRankingLoading(false);
    }
  }, []);

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

    const loadedQuestions = await loadQuestionsByIds(questionIds);
    const byId = new Map(loadedQuestions.map(question => [question.id, question]));
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
        void loadRankings();
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh battle room.');
    } finally {
      refreshingRoom.current = false;
    }
  }, [activeRoomId, loadBalance, loadProfileNames, loadQuestionsForRoom, loadRankings, loadRoomAnswers, loadRooms, profile?.id, stage]);

  const refreshRoomRef = useRef(refreshActiveRoom);
  refreshRoomRef.current = refreshActiveRoom;

  useEffect(() => {
    void loadRooms();
    void loadBalance();
    void loadRankings();
  }, [loadBalance, loadRankings, loadRooms]);

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
      void loadRankings();
    } catch (completionError) {
      setWaitingForOpponent(true);
      setError(completionError instanceof Error ? completionError.message : 'Unable to settle battle. Retrying...');
    } finally {
      completingBattle.current = false;
    }
  }, [loadBalance, loadRankings, profile]);

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

  async function createRoom(override?: { wager: number; count: number; seconds: number }) {
    if (!profile || creatingRoom.current) return;
    const roomWager = override?.wager ?? wager;
    const roomCount = override?.count ?? questionCount;
    const roomSeconds = override?.seconds ?? secondsPerQuestion;
    if (override ? roomWager > balance : !isValidWager) {
      if (override) setError(translate(language, 'ui.insufficientPoints'));
      return;
    }
    if (!isSupabaseEnabled) {
      setError('Online battle rooms require Supabase to be enabled.');
      return;
    }

    creatingRoom.current = true;
    setLoading(true);
    setError('');
    try {
      const room = await createOnlineBattleRoom(roomWager, roomCount, roomSeconds);
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
      creatingRoom.current = false;
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
    if (!activeRoom || cancellingRoom.current) return;
    cancellingRoom.current = true;
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
      cancellingRoom.current = false;
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

  const locale = languageLocales[language];
  const localText = LOCAL_TEXT[language as string] ?? LOCAL_TEXT.en;
  const myRank = rankings.find(row => row.user_id === profile?.id);

  function joinByCode() {
    const code = joinCode.trim().replace(/^#/, '').toLowerCase();
    if (!code) return;
    const target = rooms.find(room => room.id.toLowerCase().startsWith(code));
    if (!target) {
      setError(localText.codeNotFound);
      return;
    }
    if (target.creator_id === profile?.id || target.opponent_id === profile?.id) {
      setActiveRoom(target);
      setStage('waiting');
      return;
    }
    void joinRoom(target.id);
  }

  const errorBox = error && (
    <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20">
      {translateMessage(language, error)}
    </div>
  );

  const settingRows = [
    { icon: ListChecks, label: translate(language, 'ui.battleCount'), value: questionCount, set: setQuestionCount, min: 1, max: 20, suffix: '' },
    { icon: Timer, label: translate(language, 'ui.battleSeconds'), value: secondsPerQuestion, set: setSecondsPerQuestion, min: 5, max: 300, suffix: '' },
    { icon: Coins, label: translate(language, 'ui.wager'), value: wager, set: setWager, min: 0, max: undefined, suffix: '' },
  ];

  // ================= LOBBY =================
  if (stage === 'lobby') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battle')} subtitle={translate(language, 'battlePage.studyMenu')}>
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-100 via-indigo-50 to-white p-6 ring-1 ring-indigo-100 dark:from-[#1a1f5c] dark:via-[#10173f] dark:to-[#0a0e24] dark:ring-indigo-400/20 sm:p-8">
            <Swords aria-hidden className="pointer-events-none absolute -right-4 -top-4 h-44 w-44 -rotate-12 text-indigo-500/10 dark:text-indigo-300/10" />
            <Sparkles aria-hidden className="pointer-events-none absolute right-8 top-6 h-6 w-6 text-violet-400" />
            <div className="relative max-w-md">
              <h2 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight text-indigo-600 dark:text-indigo-200 sm:text-3xl">
                <Swords className="h-8 w-8 shrink-0" />
                {translate(language, 'battlePage.battle')}
              </h2>
              <p className={`mt-3 text-sm leading-relaxed ${mute}`}>{translate(language, 'ui.roomIntro')}</p>
            </div>
            {!isSupabaseEnabled && (
              <div className="relative mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/30">
                {translate(language, 'ui.onlineRequired')}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className={`${panel} grid grid-cols-3 divide-x divide-indigo-100 dark:divide-indigo-400/15`}>
            <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 text-sm font-black text-amber-900 shadow">P</span>
              <p className={`min-w-0 text-lg font-extrabold tabular-nums sm:text-xl ${strong}`}>
                {translate(language, 'ui.pointAmount', { count: balance.toLocaleString(locale) })}
              </p>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <p className={`text-xs font-medium ${mute}`}>{translate(language, 'ui.wins')}</p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-lg font-extrabold tabular-nums ${strong}`}>
                <Flame className="h-5 w-5 fill-amber-400 text-orange-500" />
                {(myRank?.win_count ?? 0).toLocaleString(locale)}
              </p>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <p className={`text-xs font-medium ${mute}`}>{translate(language, 'ui.rank')}</p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-lg font-extrabold tabular-nums ${strong}`}>
                <CrownIcon className="h-5 w-5" />
                {myRank ? `#${myRank.ranking_position}` : '—'}
              </p>
            </div>
          </div>

          {errorBox}

          {/* Create + Join */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section ref={createCardRef} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-400 via-indigo-400 to-sky-300 p-5 text-indigo-950 shadow-lg shadow-indigo-400/25 ring-1 ring-white/40 dark:from-violet-500 dark:via-indigo-600 dark:to-indigo-700 dark:text-white dark:shadow-indigo-500/20 dark:ring-white/10">
              <h3 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
                <Zap className="h-6 w-6 text-yellow-300" />
                {translate(language, 'ui.createRoom')}
              </h3>
              <p className="mt-1.5 text-sm text-indigo-900/75 dark:text-indigo-100">{translate(language, 'ui.roomIntro')}</p>
              <div className="mt-4 divide-y divide-indigo-200/60 rounded-2xl bg-white/70 ring-1 ring-white/80 dark:divide-white/10 dark:bg-black/20 dark:ring-white/15">
                {settingRows.map(({ icon: Icon, label, value, set, min, max }) => (
                  <label key={label} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Icon className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-200" />
                    <span className="flex-1 text-slate-600 dark:text-indigo-100">{label}</span>
                    <input
                      type="number"
                      aria-label={label}
                      min={min}
                      max={max}
                      step={1}
                      value={Number.isNaN(value) ? '' : value}
                      disabled={loading}
                      onChange={event => set(event.target.valueAsNumber)}
                      className="w-20 appearance-none rounded-lg border-0 bg-transparent py-1 text-right font-extrabold text-indigo-950 focus:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:text-white dark:focus:bg-white/10 dark:focus:ring-white/60"
                    />
                  </label>
                ))}
              </div>
              {hasInsufficientBalance && (
                <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-200">{translate(language, 'ui.insufficientPoints')}</p>
              )}
              <button type="button"
                onClick={() => void createRoom()}
                disabled={loading || !isSupabaseEnabled || !isValidWager || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20 || !Number.isInteger(secondsPerQuestion) || secondsPerQuestion < 5 || secondsPerQuestion > 300}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-extrabold uppercase text-indigo-600 shadow-sm transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600 disabled:opacity-50"
              >
                {translate(language, 'ui.createRoom')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </section>

            <section className={`${panel} p-5`}>
              <h3 className={`flex items-center gap-2 text-lg font-black uppercase tracking-tight ${strong}`}>
                <Users className="h-6 w-6 text-indigo-500 dark:text-indigo-300" />
                {localText.joinTitle}
              </h3>
              <p className={`mt-1.5 text-sm ${mute}`}>{localText.joinHelp}</p>
              <label className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f8f7ff] px-4 py-3 ring-1 ring-indigo-100 focus-within:ring-2 focus-within:ring-indigo-500 dark:bg-white/5 dark:ring-indigo-300/20">
                <Tag className="h-5 w-5 shrink-0 text-indigo-400" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={event => setJoinCode(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') joinByCode(); }}
                  placeholder={localText.codePlaceholder}
                  aria-label={localText.joinTitle}
                  className="w-full appearance-none border-0 !bg-transparent p-0 text-sm font-semibold text-slate-800 shadow-none outline-none ring-0 placeholder:text-slate-400 focus:!bg-transparent focus:shadow-none focus:outline-none focus:ring-0 [-webkit-tap-highlight-color:transparent] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill]:[-webkit-text-fill-color:inherit] dark:text-white dark:placeholder:text-slate-500"
                />
              </label>
              <button type="button"
                onClick={joinByCode}
                disabled={loading || !joinCode.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-violet-400 py-3 text-sm font-extrabold uppercase text-white transition hover:from-sky-300 hover:to-violet-300 dark:from-sky-300 dark:to-blue-400 dark:hover:from-sky-200 dark:hover:to-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:text-slate-900 dark:focus-visible:ring-offset-[#0f1530]"
              >
                {localText.joinBtn}
                <ArrowRight className="h-4 w-4" />
              </button>
            </section>
          </div>

          {/* Rooms */}
          <section className={`${panel} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className={`flex items-center gap-2.5 text-base font-black uppercase ${strong}`}>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <Users className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />
                {translate(language, 'ui.availableRooms')}
              </h3>
              <button
                type="button"
                aria-label={translate(language, 'ui.checkRooms')}
                onClick={loadRooms}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>

            <ul className="space-y-3">
              {rooms.map(room => {
                const mine = room.creator_id === profile?.id || room.opponent_id === profile?.id;
                return (
                  <li key={room.id} className={`${inner} flex items-center gap-4 p-4`}>
                    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500">
                      <Gamepad2 className="h-8 w-8 text-white" />
                      <CrownIcon className="absolute -right-1.5 -top-2 h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-base font-extrabold ${strong}`}>
                        {translate(language, 'ui.room', { id: room.id.slice(0, 8).toUpperCase() })}
                      </p>
                      <p className={`truncate text-xs font-medium ${mute}`}>
                        {profileNames[room.creator_id] ?? translate(language, 'ui.waitingPlayer')} · {new Date(room.created_at).toLocaleTimeString(locale)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-indigo-400" />{room.question_ids.length}</span>
                        <span className="flex items-center gap-1.5"><Timer className="h-4 w-4 text-indigo-400" />{translate(language, 'ui.seconds', { count: room.time_per_question_seconds ?? DEFAULT_TIME_PER_QUESTION })}</span>
                        <span className="flex items-center gap-1.5"><Coins className="h-4 w-4 text-amber-500" />{room.wager_points.toLocaleString(locale)}</span>
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => {
                        if (mine) {
                          setActiveRoom(room);
                          setStage('waiting');
                        } else void joinRoom(room.id);
                      }}
                      disabled={loading}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-extrabold uppercase text-white transition hover:from-violet-500 hover:to-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:opacity-40 dark:focus-visible:ring-offset-[#0f1530]"
                    >
                      <Swords className="h-4 w-4" />
                      {mine ? translate(language, 'ui.resume') : translate(language, 'ui.join')}
                    </button>
                  </li>
                );
              })}

              {rooms.length === 0 && (
                <li className="rounded-2xl border border-dashed border-indigo-200 px-4 py-8 text-center dark:border-indigo-300/20">
                  <Users className="mx-auto mb-2 h-8 w-8 text-indigo-400" />
                  <p className={`text-sm font-bold ${strong}`}>{translate(language, 'ui.noRooms')}</p>
                  <button type="button"
                    onClick={() => createCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-extrabold uppercase text-white transition hover:from-violet-500 hover:to-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0f1530]"
                  >
                    <Zap className="h-4 w-4" />
                    {translate(language, 'ui.gotoCreateRoom')}
                  </button>
                </li>
              )}
            </ul>
          </section>

          {/* Ranking */}
          <section className={`${panel} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 p-5">
              <div>
                <h3 className={`flex items-center gap-2 text-base font-black uppercase ${strong}`}>
                  <Trophy className="h-5 w-5 text-amber-500" />
                  {translate(language, 'ui.battleRanking')}
                </h3>
                <p className={`mt-1 text-xs ${mute}`}>{translate(language, 'ui.rankingHelp')}</p>
              </div>
              <button
                type="button"
                aria-label={translate(language, 'ui.refreshRanking')}
                onClick={() => void loadRankings()}
                disabled={rankingLoading || !isSupabaseEnabled}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <RefreshCw className={`h-5 w-5 ${rankingLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {rankingError ? (
              <p role="alert" className="px-5 pb-5 text-sm text-rose-500">{translateMessage(language, rankingError)}</p>
            ) : rankingLoading ? (
              <p role="status" className={`px-5 pb-5 text-sm ${mute}`}>{translate(language, 'ui.loadingRanking')}</p>
            ) : rankings.length === 0 ? (
              <p className={`px-5 pb-5 text-sm ${mute}`}>{translate(language, 'ui.noRanking')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-indigo-100 bg-[#f8f7ff] text-xs font-semibold text-slate-400 dark:border-indigo-400/15 dark:bg-white/5">
                    <tr>
                      <th className="px-5 py-3 text-left">{translate(language, 'ui.rank')}</th>
                      <th className="px-3 py-3 text-left">{translate(language, 'ui.player')}</th>
                      <th className="px-3 py-3 text-right">{translate(language, 'ui.wins')}</th>
                      <th className="px-5 py-3 text-right">{translate(language, 'ui.battleCorrect')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50 dark:divide-indigo-400/10">
                    {rankings.map(row => {
                      const isCurrentUser = row.user_id === profile?.id;
                      return (
                        <tr key={row.user_id} className={isCurrentUser ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}>
                          <td className={`px-5 py-3.5 text-base font-extrabold ${mute}`}>
                            {row.ranking_position <= 3
                              ? ['🥇', '🥈', '🥉'][row.ranking_position - 1]
                              : `#${row.ranking_position}`}
                          </td>
                          <td className={`px-3 py-3.5 font-semibold ${strong}`}>
                            {row.name}
                            {isCurrentUser && (
                              <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">{translate(language, 'ui.you')}</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right font-extrabold tabular-nums text-violet-600 dark:text-violet-300">
                            {row.win_count.toLocaleString(locale)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-indigo-500 dark:text-indigo-300">
                            {row.correct_answer_count.toLocaleString(locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </Layout>
    );
  }

  // ================= WAITING =================
  if (stage === 'waiting') {
    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'ui.waitingOpponent')} subtitle={translate(language, 'battlePage.battle')}>
        <div className={`${panel} mx-auto max-w-md p-8 text-center`}>
          <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/30 motion-reduce:animate-none" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
              <Swords className="h-9 w-9 text-white" />
            </span>
          </div>
          <h2 className={`text-xl font-extrabold ${strong}`}>{translate(language, 'ui.room', { id: activeRoom?.id.slice(0, 8).toUpperCase() ?? '' })}</h2>
          <div className={`mt-4 flex flex-col gap-1.5 text-sm ${mute}`}>
            <p>{translate(language, 'ui.wagerLocked', { count: activeRoom?.wager_points.toLocaleString(locale) ?? 0 })}</p>
            <p>{translate(language, 'ui.roomRules', { count: activeRoom?.question_ids.length ?? 0, seconds: roomTimeLimit })}</p>
          </div>
          <p className={`mt-5 text-sm ${mute}`}>{translate(language, 'ui.keepOpen')}</p>
          {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-500">{translateMessage(language, error)}</p>}
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button"
              onClick={() => {
                setActiveRoom(null);
                setStage('lobby');
                void loadRooms();
              }}
              disabled={loading}
              className={primaryBtn}
            >
              {translate(language, 'ui.checkRooms')}
            </button>
            <button type="button" onClick={() => void cancelRoom()} disabled={loading} className={secondaryBtn}>
              {translate(language, 'ui.cancelRefund')}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // ================= RESULT =================
  if (stage === 'result') {
    const won = activeRoom?.winner_id === profile?.id;
    const draw = activeRoom?.winner_id === null;
    const wagerPoints = activeRoom?.wager_points ?? 0;
    const pointsAdded = draw ? wagerPoints : won ? wagerPoints * 2 : 0;
    const pointsDeducted = draw || won ? 0 : wagerPoints;
    const totalQuestions = activeRoom?.question_ids.length ?? questions.length;
    const myCorrect = answers.filter(answer => answer.user_id === profile?.id && answer.is_correct).length;
    const title = won ? translate(language, 'ui.victory') : draw ? translate(language, 'ui.draw') : translate(language, 'ui.defeat');
    const subtitle = draw ? translate(language, 'ui.drawRefund') : won ? translate(language, 'ui.wonWager') : translate(language, 'ui.lostWager');
    const myName = profile?.name ?? translate(language, 'ui.you');
    const backToLobby = () => { setStage('lobby'); setActiveRoom(null); void loadRooms(); void loadBalance(); };
    const replay = () => {
      if (!activeRoom) return;
      void createRoom({
        wager: activeRoom.wager_points,
        count: activeRoom.question_ids.length,
        seconds: activeRoom.time_per_question_seconds ?? DEFAULT_TIME_PER_QUESTION,
      });
    };
    const seconds = translate(language, 'ui.seconds', { count: roomTimeLimit });

    if (won) {
      return (
        <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleResult')} subtitle={translate(language, 'battlePage.battle')}>
          <div className={`${panel} relative mx-auto max-w-md overflow-hidden p-6 text-center sm:p-8`}>
            {CONFETTI.map((piece, i) => (
              <span key={i} aria-hidden className={`absolute h-2.5 w-5 rounded-sm ${piece}`} />
            ))}
            <CrownIcon className="relative mx-auto h-14 w-14" />
            <h2 className={`relative mt-3 text-5xl font-black uppercase tracking-tight ${gradientText}`}>{title}</h2>
            <p className={`relative mt-3 text-sm ${mute}`}>{subtitle}</p>

            <div className={`${inner} relative mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4`}>
              <PlayerCard name={myName} score={playerScore} crown highlight stacked />
              <span className="text-lg font-black text-indigo-400">{translate(language, 'ui.versus')}</span>
              <PlayerCard name={opponentName} score={opponentScore} stacked />
            </div>

            <div className={`${inner} relative mt-3 grid grid-cols-3 divide-x divide-indigo-100 py-3 dark:divide-indigo-300/15`}>
              <Stat icon={CheckCircle} tint="text-emerald-500" label={translate(language, 'ui.battleCorrect')} value={`${myCorrect}/${totalQuestions}`} />
              <Stat icon={Timer} tint="text-indigo-400" label={translate(language, 'ui.perQuestion')} value={seconds} />
              <Stat icon={Flame} tint="text-orange-500" label={translate(language, 'ui.pointsAdded')} value={`+${pointsAdded.toLocaleString(locale)}`} />
            </div>

            <p className={`relative mt-4 text-xs font-medium ${mute}`}>{translate(language, 'ui.balance', { count: balance.toLocaleString(locale) })}</p>
            <div className="relative mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={backToLobby} className="inline-flex items-center justify-center gap-2 rounded-full bg-transparent px-4 py-3.5 text-sm font-bold text-indigo-600 ring-2 ring-indigo-300 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-violet-500 dark:text-indigo-200 dark:ring-indigo-400/40 dark:hover:bg-white/5">
                <ArrowLeft className="h-4 w-4" />
                {translate(language, 'ui.backLobby')}
              </button>
              <button type="button" onClick={replay} disabled={loading || wagerPoints > balance} className={`${primaryBtn} px-4 py-3.5`}>
                <RotateCcw className="h-4 w-4" />
                {localText.playNext}
              </button>
            </div>
            {error && <p role="alert" className="relative mt-3 text-sm font-medium text-rose-500">{translateMessage(language, error)}</p>}
          </div>
        </Layout>
      );
    }

    return (
      <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleResult')} subtitle={translate(language, 'battlePage.battle')}>
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <svg viewBox="0 0 160 120" aria-hidden className="mx-auto h-32 w-40 text-indigo-400">
            <rect x="26" y="20" width="62" height="72" rx="8" transform="rotate(-9 57 56)" fill="currentColor" opacity=".35" />
            <rect x="52" y="36" width="76" height="74" rx="10" fill="currentColor" opacity=".75" />
            <path d="M74 62l10 10m0-10L74 72M98 62l10 10m0-10L98 72" stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round" />
            <path d="M82 92q12-9 24 0" stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M118 18v14M126 20v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />
          </svg>
          <div>
            <h2 className={`text-5xl font-black uppercase tracking-tight ${gradientText}`}>{title}</h2>
            <p className={`mx-auto mt-3 max-w-sm text-sm leading-relaxed ${mute}`}>{subtitle}</p>
          </div>

          <div className={`${inner} grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4`}>
            <PlayerCard name={myName} score={playerScore} highlight={draw} stacked />
            <span className="text-lg font-black text-indigo-400">{translate(language, 'ui.versus')}</span>
            <PlayerCard name={opponentName} score={opponentScore} crown={!draw} highlight stacked smallCrown />
          </div>

          <div className={`${panel} grid grid-cols-3 divide-x divide-indigo-100 py-4 dark:divide-indigo-400/15`}>
            <Stat icon={ListChecks} tint="text-indigo-400" label={translate(language, 'ui.questions')} value={`${totalQuestions}`} />
            <Stat icon={Timer} tint="text-indigo-400" label={translate(language, 'ui.perQuestion')} value={seconds} />
            <Stat icon={Coins} tint="text-amber-500" label={draw ? translate(language, 'ui.pointsAdded') : translate(language, 'ui.pointsDeducted')} value={draw ? `+${pointsAdded.toLocaleString(locale)}` : `-${pointsDeducted.toLocaleString(locale)}`} />
          </div>

          <div className={`${panel} flex items-center gap-4 p-4 text-left`}>
            <Lightbulb className="h-8 w-8 shrink-0 text-amber-400" />
            <p className={`text-sm ${mute}`}>{localText.hint}</p>
          </div>

          <p className={`text-xs font-medium ${mute}`}>{translate(language, 'ui.balance', { count: balance.toLocaleString(locale) })}</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={backToLobby} className="inline-flex items-center justify-center gap-2 rounded-full bg-transparent px-6 py-3.5 text-sm font-bold text-indigo-600 ring-2 ring-indigo-300 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-violet-500 dark:text-indigo-200 dark:ring-indigo-400/40 dark:hover:bg-white/5">
              <ArrowLeft className="h-4 w-4" />
              {translate(language, 'ui.backLobby')}
            </button>
            <button type="button" onClick={replay} disabled={loading || wagerPoints > balance} className={`${primaryBtn} py-3.5`}>
              <RotateCcw className="h-4 w-4" />
              {localText.replay}
            </button>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-rose-500">{translateMessage(language, error)}</p>}
        </div>
      </Layout>
    );
  }

  // ================= BATTLE =================
  const urgent = timeLeft <= 10;
  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'battlePage.battleInProgress')} subtitle={translate(language, 'battlePage.battle')}>
      <div className="mx-auto max-w-2xl space-y-4">
        {errorBox}

        {/* Scoreboard */}
        <div className={`${panel} overflow-hidden`}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5 sm:px-8">
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${mute}`}>{profile?.name ?? translate(language, 'ui.you')}</p>
              <p className="text-5xl font-black tabular-nums text-indigo-600 dark:text-indigo-300">{playerScore}</p>
            </div>
            <div className="flex flex-col items-center">
              <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black tabular-nums text-white ring-4 transition-colors ${urgent ? 'bg-rose-500 ring-rose-500/25' : 'bg-gradient-to-br from-violet-500 to-indigo-600 ring-violet-500/25'}`}>
                {timeLeft}
              </span>
              <p className={`mt-2 text-xs font-semibold tabular-nums ${mute}`}>{currentIndex + 1} / {questions.length}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className={`truncate text-sm font-semibold ${mute}`}>{opponentName}</p>
              <p className="text-5xl font-black tabular-nums text-sky-500 dark:text-sky-300">{opponentScore}</p>
            </div>
          </div>
          <div className="h-1.5 bg-indigo-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={roomTimeLimit} aria-valuenow={timeLeft}>
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-500 to-sky-400'}`}
              style={{ width: `${Math.max(0, Math.min(100, timePct))}%` }}
            />
          </div>
        </div>

        {waitingForOpponent ? (
          <div className={`${panel} p-10 text-center`}>
            <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-violet-500 motion-reduce:animate-none" />
            <h2 className={`text-xl font-extrabold ${strong}`}>{translate(language, 'ui.waitingFinish')}</h2>
            <p className={`mt-2 text-sm ${mute}`}>{translate(language, 'ui.settleHelp')}</p>
          </div>
        ) : (
          <>
            <div className={`${panel} p-6 sm:p-8`}>
              <p className="mb-4 inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                {translate(language, 'ui.questionNumber', { count: currentIndex + 1 })}
              </p>
              <p className={`whitespace-pre-line text-lg font-medium leading-relaxed ${strong}`}>{question?.question_text}</p>
              <QuestionImage question={question} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {choices.map((choice, idx) => {
                let cls = 'bg-white ring-1 ring-indigo-200 hover:ring-violet-400 hover:bg-violet-50/50 dark:bg-[#0f1530] dark:ring-indigo-400/20 dark:hover:bg-indigo-500/10 dark:hover:ring-violet-400';
                let badge = 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300';
                if (answered) {
                  if (choice.is_correct) { cls = 'bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-500/15'; badge = 'bg-emerald-500 text-white'; }
                  else if (choice.id === selectedChoiceId) { cls = 'bg-rose-50 ring-2 ring-rose-400 dark:bg-rose-500/15'; badge = 'bg-rose-500 text-white'; }
                  else { cls = 'bg-[#f8f7ff] ring-1 ring-indigo-50 opacity-50 dark:bg-white/5 dark:ring-white/5'; }
                }
                return (
                  <button type="button"
                    key={choice.id}
                    onClick={() => void handleAnswer(choice.id)}
                    disabled={answered}
                    className={`flex items-start gap-3 rounded-2xl p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-default ${cls}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${badge}`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 text-slate-800 dark:text-slate-100">
                      <AnswerChoiceContent question={question} choice={choice} displayIndex={idx} />
                    </span>
                    {answered && choice.is_correct && <CheckCircle className="h-5 w-5 shrink-0 text-emerald-500" />}
                    {answered && !choice.is_correct && choice.id === selectedChoiceId && <XCircle className="h-5 w-5 shrink-0 text-rose-500" />}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div
                role="status"
                className={`rounded-2xl px-4 py-3 text-center text-sm font-bold ring-1 ${selectedCorrect ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20' : 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'}`}
              >
                {selectedCorrect ? translate(language, 'ui.correct') : translate(language, 'ui.incorrect', { answer: choices.find(choice => choice.is_correct)?.choice_text ?? '' })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
