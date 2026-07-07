import { useState } from "react";
import {
  Home,
  Layers,
  BarChart2,
  MessageCircle,
  MoreHorizontal,
  Trophy,
  FileText,
  Settings,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Page } from "../types";

interface MobileTabBarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function MobileTabBar({
  currentPage,
  onNavigate,
}: MobileTabBarProps) {
  const { isAdmin, signOut } = useAuth();
  const { language } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const t = (ja: string, en: string, vi: string) =>
    language === "ja" ? ja : language === "en" ? en : vi;

  const tabItems = [
    { icon: Home, label: t("ホーム", "Home", "Trang chủ"), page: "home" as Page },
    { icon: Layers, label: t("演習", "Practice", "Luyện tập"), page: "practice-list" as Page },
    { icon: BarChart2, label: t("模試", "Mock", "Thi thử"), page: "mock-exam" as Page },
    { icon: MessageCircle, label: t("AI", "AI", "AI"), page: "ai-chat" as Page },
  ];

  const moreItems = [
    { icon: Trophy, label: t("対戦", "Battle", "Đối kháng"), page: "battle" as Page },
    { icon: FileText, label: t("教材", "Materials", "Tài liệu"), page: "materials" as Page },
    { icon: Settings, label: t("設定", "Settings", "Cài đặt"), page: "settings" as Page },
    ...(isAdmin ? [{ icon: ShieldCheck, label: "Admin", page: "admin" as Page }] : []),
  ];

  function go(page: Page) {
    onNavigate(page);
    setMoreOpen(false);
  }

  const isActive = (page: Page) =>
    currentPage === page ||
    (page === "practice-list" && currentPage === "practice-question");

  return (
    <>
      {/* Overflow sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-700">
                {t("メニュー", "Menu", "Menu")}
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-2">
              {moreItems.map(({ icon: Icon, label, page }) => (
                <button
                  key={page}
                  onClick={() => go(page)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition ${
                    isActive(page)
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[11px] leading-tight text-center">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 mt-2"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">
                {t("ログアウト", "Sign out", "Đăng xuất")}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {tabItems.map(({ icon: Icon, label, page }) => {
            const active = isActive(page);
            return (
              <button
                key={page}
                onClick={() => go(page)}
                className={`flex flex-col items-center gap-1 py-2.5 transition ${
                  active ? "text-blue-600" : "text-gray-500"
                }`}
              >
                <Icon size={20} />
                <span className="text-[11px] leading-tight">{label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-1 py-2.5 transition ${
              moreOpen || moreItems.some(item => isActive(item.page))
                ? "text-blue-600"
                : "text-gray-500"
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-[11px] leading-tight">
              {t("その他", "More", "Thêm")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}