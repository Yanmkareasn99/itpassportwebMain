import { translate } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Bell, Coins } from 'lucide-react';
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
  const [pointBalance, setPointBalance] = useState<number | null>(null);
  
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const notifications = [
    {
      id: 1,
      title: translate(language, 'header.todayStudyReminder'),
      body: translate(
        language,
        'header.takeOneMockExamAndReviewWeakAreas'
      ),
      time: translate(language, 'header.5MinAgo'),
      unread: true,
    },
    {
      id: 2,
      title: translate(language, 'header.materialsAreAvailable'),
      body: translate(
        language,
        'header.studentsCanCheckMaterialsAnytimeMakingInformationSharing'
      ),
      time: translate(language, 'header.1HourAgo'),
      unread: true,
    },
    {
      id: 3,
      title: translate(language, 'header.reviewRecommended'),
      body: translate(
        language,
        'header.reviewTheQuestionsYouMissedLastTime'
      ),
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
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
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
    } catch (error) {
      // swallow error; keep pointBalance null and avoid showing UI error here
    } finally {
    }
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
                setIsNotificationsOpen(open => !open)
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
              <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden z-50">
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

                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-200 px-2 py-1 rounded-full">
                    {translate(language, 'header.new')}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition border-b border-gray-50 dark:border-slate-800 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            item.unread
                              ? 'bg-blue-500'
                              : 'bg-gray-200 dark:bg-slate-600'
                          }`}
                        />

                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">
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
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Always-visible Points */}
          <div className="flex items-center" aria-hidden="false">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100 dark:bg-slate-800 dark:border-slate-700 dark:text-amber-300">
              <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-semibold">
                {pointBalance?.toLocaleString() ?? 0} pts
              </span>
            </div>
          </div>

          {/* profile removed per user request */}
        </div>
      </div>
    </header>
  );
}