import { languageLocales, translate } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Bell, Coins, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getCachedPointBalance, getPointBalance, getPointHistory } from '../lib/points';
import type { Page, PointLedgerEntry } from '../types';
import BrandLogo from './BrandLogo';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onNavigate: (page: Page) => void;
}

const DEFAULT_READ_NOTIFICATION_IDS = [3];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function readSavedNotificationIds(storageKey: string) {
  try {
    const savedIds = window.localStorage.getItem(storageKey);
    return new Set(savedIds ? JSON.parse(savedIds) as number[] : DEFAULT_READ_NOTIFICATION_IDS);
  } catch {
    return new Set(DEFAULT_READ_NOTIFICATION_IDS);
  }
}

export default function Header({ title, subtitle, onNavigate }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { language } = useLanguage();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [pointHistory, setPointHistory] = useState<PointLedgerEntry[]>([]);
  const [pointHistoryLoading, setPointHistoryLoading] = useState(false);
  const [pointHistoryError, setPointHistoryError] = useState('');
  const notificationStorageKey = `manabi-notifications-read:${profile?.id ?? 'guest'}`;
  const [readNotificationIds, setReadNotificationIds] = useState<Set<number>>(
    () => readSavedNotificationIds(notificationStorageKey),
  );
  const [pointBalance, setPointBalance] = useState<number | null>(
    () => getCachedPointBalance(profile?.id),
  );

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const notifications = [
    {
      id: 1,
      title: translate(language, 'header.todayStudyReminder'),
      body: translate(
        language,
        'header.takeOneMockExamAndReviewWeakAreas'
      ),
      time: translate(language, 'header.5MinAgo'),
      destination: 'mock-exam' as Page,
    },
    {
      id: 2,
      title: translate(language, 'header.materialsAreAvailable'),
      body: translate(
        language,
        'header.studentsCanCheckMaterialsAnytimeMakingInformationSharing'
      ),
      time: translate(language, 'header.1HourAgo'),
      destination: 'materials' as Page,
    },
    {
      id: 3,
      title: translate(language, 'header.reviewRecommended'),
      body: translate(
        language,
        'header.reviewTheQuestionsYouMissedLastTime'
      ),
      time: translate(language, 'header.yesterday'),
      destination: 'practice-list' as Page,
    },
  ];

  const unreadCount = notifications.filter(item => !readNotificationIds.has(item.id)).length;

  useEffect(() => {
    setReadNotificationIds(readSavedNotificationIds(notificationStorageKey));
  }, [notificationStorageKey]);

  function saveReadNotificationIds(ids: Set<number>) {
    setReadNotificationIds(ids);
    window.localStorage.setItem(notificationStorageKey, JSON.stringify([...ids]));
  }

  function openNotification(id: number, destination: Page) {
    const nextIds = new Set(readNotificationIds);
    nextIds.add(id);
    saveReadNotificationIds(nextIds);
    setIsNotificationsOpen(false);
    onNavigate(destination);
  }

  function markAllNotificationsAsRead() {
    saveReadNotificationIds(new Set(notifications.map(item => item.id)));
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!notificationRef.current?.contains(target)) {
        setIsNotificationsOpen(false);
      }

      if (!profileMenuRef.current?.contains(target)) {
        setIsProfileMenuOpen(false);
      }

      if (!pointsRef.current?.contains(target)) {
        setIsPointsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
        setIsPointsOpen(false);
        setIsProfileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function loadPoints() {
    if (!profile) return;

    try {
      const points = await getPointBalance(profile.id);
      setPointBalance(points.balance);
    } catch {
      setPointBalance(null);
    }
  }

  async function loadPointHistory() {
    if (!profile) return;

    setPointHistoryLoading(true);
    setPointHistoryError('');
    try {
      const [points, history] = await Promise.all([
        getPointBalance(profile.id),
        getPointHistory(profile.id),
      ]);
      setPointBalance(points.balance);
      setPointHistory(history);
    } catch {
      setPointHistoryError(translate(language, 'header.pointsHistoryFailed'));
    } finally {
      setPointHistoryLoading(false);
    }
  }

  function pointReasonLabel(entry: PointLedgerEntry) {
    const isCorrect = entry.metadata?.is_correct === true;
    switch (entry.reason) {
      case 'daily_login': return translate(language, 'ui.dailyLogin');
      case 'practice_answer': return translate(language, isCorrect ? 'ui.practiceCorrect' : 'ui.practiceWrong');
      case 'mock_answer': return translate(language, isCorrect ? 'ui.mockCorrect' : 'ui.mockWrong');
      case 'battle_wager_lock': return translate(language, 'header.battleWager');
      case 'battle_draw_refund':
      case 'battle_cancel_refund':
      case 'battle_expired_refund': return translate(language, 'header.battleRefund');
      case 'battle_win_payout': return translate(language, 'header.battleWin');
      default: return entry.reason.replace(/_/g, ' ');
    }
  }

  function formatPointHistoryDate(value: string) {
    return new Intl.DateTimeFormat(languageLocales[language], {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  useEffect(() => {
    if (profile) {
      void loadPoints();
    } else {
      setPointBalance(null);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);


  return (
    <header className="sm:h-20 header-gradient border-b border-gray-100 dark:border-slate-700 flex flex-row items-center gap-2 sm:gap-3 py-2 sm:py-0 sticky top-0 z-10">
      <div className="app-shell w-full flex items-center gap-2 sm:gap-3">
        <button type="button" onClick={() => onNavigate('home')} aria-label={translate(language, 'sidebar.home')} className="md:hidden shrink-0">
          <BrandLogo variant="mark" alt="" />
        </button>
        <div className="flex-1 min-w-0">
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-slate-400">
              {subtitle}
            </p>
          )}

          <h1 className="text-base sm:text-lg xl:text-[1.1rem] font-bold text-gray-800 dark:text-slate-100 leading-tight truncate">
            {title}
          </h1>
        </div>

        <div className="flex-1"></div>

        <div className="flex items-center justify-end gap-3 flex-1">
          {/* Notifications */}
          <div ref={notificationRef} className="relative">
            <button
              type="button"
              aria-label={translate(language, 'header.openNotifications')}
              aria-expanded={isNotificationsOpen}
              onClick={() =>
                setIsNotificationsOpen(open => {
                  setIsProfileMenuOpen(false);
                  setIsPointsOpen(false);
                  return !open;
                })
              }
              className="relative p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-800 dark:text-slate-300 rounded-lg transition"
            >
              <Bell style={{ width: 16, height: 16 }} className="sm:w-[18px] sm:h-[18px]" />

              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 min-w-[14px] h-3.5 sm:min-w-[16px] sm:h-4 px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="fixed inset-x-4 top-14 max-h-[calc(100dvh-4.5rem)] flex flex-col bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden z-50 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-3 sm:w-80 sm:max-h-none">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-100">
                      {translate(language, 'header.notifications')}
                    </p>

                    <p className="text-xs text-gray-400 dark:text-slate-400">
                      {translate(language, 'header.unreadCount', {
                        count: unreadCount,
                      })}
                    </p>
                  </div>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-100 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50 px-2 py-1 rounded-full transition"
                    >
                      {translate(language, 'header.markAllAsRead')}
                    </button>
                  )}
                </div>

                <div className="min-h-0 overflow-y-auto sm:max-h-80">
                  {notifications.map(item => {
                    const isUnread = !readNotificationIds.has(item.id);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openNotification(item.id, item.destination)}
                        aria-label={`${item.title}. ${translate(language, isUnread ? 'header.unread' : 'header.read')}`}
                        className={`w-full text-left px-4 py-3 transition border-b border-gray-50 dark:border-slate-800 last:border-b-0 ${
                          isUnread
                            ? 'bg-blue-50/60 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/30'
                            : 'bg-gray-50/60 hover:bg-gray-100/80 dark:bg-slate-900 dark:hover:bg-slate-800 opacity-70'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                              isUnread
                                ? 'bg-blue-500'
                                : 'bg-gray-200 dark:bg-slate-600'
                            }`}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className={`text-sm text-gray-800 dark:text-slate-100 truncate ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                                {item.title}
                              </p>

                              <span className="text-[10px] text-gray-400 dark:text-slate-400 shrink-0">
                                {item.time}
                              </span>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-slate-300 leading-5 mt-1">
                              {item.body}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Always-visible Points */}
          <div ref={pointsRef} className="relative flex shrink-0 items-center">
            <button
              type="button"
              aria-label={translate(language, 'header.openPointsHistory')}
              aria-expanded={isPointsOpen}
              onClick={() => {
                const willOpen = !isPointsOpen;
                setIsPointsOpen(willOpen);
                setIsNotificationsOpen(false);
                setIsProfileMenuOpen(false);
                if (willOpen) void loadPointHistory();
              }}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-amber-700 transition hover:border-amber-200 hover:bg-amber-100 sm:gap-2 sm:px-3 sm:py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700"
            >
              <Coins className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="whitespace-nowrap text-xs font-semibold sm:text-sm">
                {pointBalance?.toLocaleString(languageLocales[language]) ?? 0} pts
              </span>
            </button>

            {isPointsOpen && (
              <div className="fixed inset-x-4 top-14 z-50 flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:max-h-[calc(100dvh-6rem)] sm:w-96 dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-slate-100">
                        {translate(language, 'header.pointsHistory')}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-400">
                        {translate(language, 'header.balanceAfter', {
                          count: (pointBalance ?? 0).toLocaleString(languageLocales[language]),
                        })}
                      </p>
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                      <Coins className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto sm:max-h-96">
                  {pointHistoryLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                    </div>
                  ) : pointHistoryError ? (
                    <p role="alert" className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-300">
                      {pointHistoryError}
                    </p>
                  ) : pointHistory.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-400">
                      {translate(language, 'header.noPointsHistory')}
                    </p>
                  ) : (
                    pointHistory.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0 dark:border-slate-800">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          entry.delta >= 0
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300'
                            : 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300'
                        }`}>
                          {entry.delta >= 0 ? '+' : '−'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium capitalize text-gray-700 dark:text-slate-200">
                            {pointReasonLabel(entry)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-400">
                            {formatPointHistoryDate(entry.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${entry.delta >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                            {entry.delta >= 0 ? '+' : ''}{entry.delta.toLocaleString(languageLocales[language])}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-400">
                            {entry.balance_after.toLocaleString(languageLocales[language])} pts
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              aria-label={translate(language, 'settingsPage.profile')}
              aria-expanded={isProfileMenuOpen}
              onClick={() =>
                setIsProfileMenuOpen(open => {
                  setIsNotificationsOpen(false);
                  setIsPointsOpen(false);
                  return !open;
                })
              }
              className="flex items-center rounded-full transition hover:opacity-90"
            >
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full profile-avatar-gradient text-sm font-bold text-white shadow-inner">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile?.name ?? translate(language, 'header.guest')}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="flex h-full w-full items-center justify-center">
                    {getInitials(profile?.name ?? translate(language, 'header.guest'))}
                  </span>
                )}
              </span>
            </button>

            {isProfileMenuOpen && (
<div className="fixed right-4 top-14 z-50 w-max min-w-[180px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:right-0 sm:top-auto sm:mt-3 sm:w-72">                <div className="border-b border-gray-100 px-4 py-3 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full profile-avatar-gradient text-sm font-bold text-white shadow-inner">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile?.name ?? translate(language, 'header.guest')}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound className="h-5 w-5 text-white" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-slate-100">
                        {profile?.name ?? translate(language, 'header.guest')}
                      </p>
                      <p className="truncate text-xs text-gray-400 dark:text-slate-400">
                        {profile?.student_id ?? translate(language, 'settingsPage.account')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <UserRound className="h-4 w-4" />
                    <span>{translate(language, 'settingsPage.profile')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      void signOut();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{translate(language, 'sidebar.signOut')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
