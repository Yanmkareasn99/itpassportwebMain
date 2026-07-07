import { useEffect, useRef, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

function greeting(language: string) {
  const h = new Date().getHours();
  if (language === 'en') {
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
  if (language === 'vi') {
    if (h < 12) return 'Chao buoi sang';
    if (h < 17) return 'Chao buoi chieu';
    return 'Chao buoi toi';
  }
  if (h < 12) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'こんばんは';
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const notifications = [
    {
      id: 1,
      title: language === 'ja' ? '今日の学習リマインダー' : language === 'en' ? 'Today study reminder' : 'Nhac hoc hom nay',
      body: language === 'ja' ? '模擬試験を1回解いて、苦手分野を確認しましょう。' : language === 'en' ? 'Take one mock exam and review weak areas.' : 'Lam mot bai thi thu va xem lai phan con yeu.',
      time: language === 'ja' ? '5分前' : language === 'en' ? '5 min ago' : '5 phut truoc',
      unread: true,
    },
    {
      id: 2,
      title: language === 'ja' ? '教材を確認できます' : language === 'en' ? 'Materials are available' : 'Co the xem tai lieu',
      body: language === 'ja' ? '学生はいつでも教材を確認できるため、情報共有がスムーズになります。' : language === 'en' ? 'Students can check materials anytime, making information sharing smoother.' : 'Hoc sinh co the xem tai lieu bat cu luc nao, giup chia se thong tin muot hon.',
      time: language === 'ja' ? '1時間前' : language === 'en' ? '1 hour ago' : '1 gio truoc',
      unread: true,
    },
    {
      id: 3,
      title: language === 'ja' ? '復習おすすめ' : language === 'en' ? 'Review recommended' : 'Nen on tap',
      body: language === 'ja' ? '前回間違えた問題をもう一度確認しましょう。' : language === 'en' ? 'Review the questions you missed last time.' : 'Hay xem lai cau ban da sai lan truoc.',
      time: language === 'ja' ? '昨日' : language === 'en' ? 'Yesterday' : 'Hom qua',
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
      if (event.key === 'Escape') setIsNotificationsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const guest = language === 'ja' ? 'ゲスト' : language === 'en' ? 'Guest' : 'Khach';

  return (
    <header className="min-h-16 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-0 sticky top-0 z-10">
      <div className="min-w-0">
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        <h1 className="text-base sm:text-lg font-bold text-gray-800 leading-tight truncate">{title}</h1>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" style={{ width: 15, height: 15 }} />
          <input
            type="text"
            placeholder={language === 'ja' ? '検索...' : language === 'en' ? 'Search...' : 'Tim kiem...'}
            className="pl-8 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition w-48"
          />
        </div>
        <div ref={notificationRef} className="relative">
          <button
            type="button"
            aria-label={language === 'ja' ? '通知を開く' : language === 'en' ? 'Open notifications' : 'Mo thong bao'}
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
                  <p className="text-sm font-bold text-gray-800">{language === 'ja' ? '通知' : language === 'en' ? 'Notifications' : 'Thong bao'}</p>
                  <p className="text-xs text-gray-400">
                    {language === 'ja' ? `${unreadCount}件の未読があります` : language === 'en' ? `${unreadCount} unread` : `${unreadCount} chua doc`}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">New</span>
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
        <div className="flex items-center gap-2.5 pl-2 border-l border-gray-100">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
            {profile?.name?.charAt(0) ?? 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-700 leading-tight">{profile?.name ?? guest}</p>
            <p className="text-[10px] text-gray-400">{greeting(language)}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
