import { translate } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Bell, Coins, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getPointBalance } from '../lib/points';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [pointBalance, setPointBalance] = useState<number | null>(null);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState('');
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const notifications = [
    {
      id: 1,
      title: translate(language, 'header.todayStudyReminder'),
      body: translate(language, 'header.takeOneMockExamAndReviewWeakAreas'),
      time: translate(language, 'header.5MinAgo'),
      unread: true,
    },
    {
      id: 2,
      title: translate(language, 'header.materialsAreAvailable'),
      body: translate(language, 'header.studentsCanCheckMaterialsAnytimeMakingInformationSharing'),
      time: translate(language, 'header.1HourAgo'),
      unread: true,
    },
    {
      id: 3,
      title: translate(language, 'header.reviewRecommended'),
      body: translate(language, 'header.reviewTheQuestionsYouMissedLastTime'),
      time: translate(language, 'header.yesterday'),
      unread: false,
    },
  ];

  const unreadCount = notifications.filter(item => item.unread).length;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!notificationRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (!profileRef.current?.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
        setIsProfileOpen(false);
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
    setPointsLoading(true);
    setPointsError('');
    try {
      const points = await getPointBalance(profile.id);
      setPointBalance(points.balance);
    } catch (error) {
      setPointsError(error instanceof Error ? error.message : 'Unable to load points.');
    } finally {
      setPointsLoading(false);
    }
  }

  useEffect(() => {
    if (profile) void loadPoints();
    else setPointBalance(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const guest = translate(language, 'header.guest');

  return (
    <header className="min-h-16 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-0 sticky top-0 z-10">
      <div className="min-w-0">
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        <h1 className="text-base sm:text-lg font-bold text-gray-800 leading-tight truncate">{title}</h1>
      </div>

      <div className="flex items-center justify-end gap-3">
        <div ref={notificationRef} className="relative">
          <button
            type="button"
            aria-label={translate(language, 'header.openNotifications')}
            aria-expanded={isNotificationsOpen}
            onClick={() => setIsNotificationsOpen(open => !open)}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition"
          >
            <Bell style={{ width: 18, height: 18 }} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800">{translate(language, 'header.notifications')}</p>
                  <p className="text-xs text-gray-400">
                    {translate(language, 'header.unreadCount', { count: unreadCount })}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{translate(language, 'header.new')}</span>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.map(item => (
                  <button key={item.id} type="button" className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.unread ? 'bg-blue-500' : 'bg-gray-200'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                          <span className="text-[10px] text-gray-400 shrink-0">{item.time}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-5 mt-1">{item.body}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          ref={profileRef}
          className="relative"
          onMouseEnter={() => {
            setIsProfileOpen(true);
            void loadPoints();
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen(open => !open);
              void loadPoints();
            }}
            className="flex items-center gap-2.5 pl-2 border-l border-gray-100"
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
              {profile?.name?.charAt(0) ?? 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-700 leading-tight">{profile?.name ?? guest}</p>
              <p className="text-[10px] text-amber-600 font-semibold leading-tight">
                {pointBalance?.toLocaleString() ?? 0} pts
              </p>
            </div>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-64 max-w-[calc(100vw-2rem)] bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">{profile?.name ?? guest}</p>
                <p className="text-xs text-gray-400">{profile?.student_id ?? profile?.role ?? ''}</p>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">Points</p>
                      <p className="text-xl font-bold text-amber-700">{pointBalance?.toLocaleString() ?? 0}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={loadPoints}
                    disabled={pointsLoading}
                    className="p-2 rounded-lg text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
                    aria-label="Refresh points"
                  >
                    <RefreshCw className={`w-4 h-4 ${pointsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {pointsError && <p className="text-xs text-red-500 mt-2">{pointsError}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
