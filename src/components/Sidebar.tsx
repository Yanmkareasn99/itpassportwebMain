import { translate } from '../i18n';
import {
  BookOpen,
  Home,
  Layers,
  Trophy,
  BarChart2,
  MessageCircle,
  Settings,
  LogOut,
  ShieldCheck,
  FileText,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Page } from "../types";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({
  currentPage,
  onNavigate,
}: SidebarProps) {
  const { isAdmin, signOut } = useAuth();
  const { language } = useLanguage();

  const navItems = [
    {
      icon: Home,
      label:
        translate(language, 'sidebar.home'),
      page: "home" as Page,
    },
    {
      icon: Layers,
      label:
        translate(language, 'sidebar.practice'),
      page: "practice-list" as Page,
    },
    {
      icon: BarChart2,
      label:
        translate(language, 'sidebar.mockExam'),
      page: "mock-exam" as Page,
    },
    {
      icon: Trophy,
      label:
        translate(language, 'sidebar.battle'),
      page: "battle" as Page,
    },
    {
      icon: MessageCircle,
      label:
        translate(language, 'sidebar.aiChat'),
      page: "ai-chat" as Page,
    },
    {
      icon: FileText,
      label:
        translate(language, 'sidebar.materials'),
      page: "materials" as Page,
    },
  ];

  return (
    <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 w-56 bg-white border-r border-gray-200 flex-col z-50 dark:bg-[#111827] dark:border-slate-700">

      {/* Logo */}

      <div className="h-20 flex items-center justify-center border-b px-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-blue-600">マナビ</span>
        </div>
      </div>

      {/* Menu */}

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">

        {navItems.map(({ icon: Icon, label, page }) => {

          const active =
            currentPage === page ||
            (page === "practice-list" &&
              currentPage === "practice-question");

          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition
              ${
                active
                  ? "bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon size={20} />

              <span className="flex-1 text-left">
                {label}
              </span>

              {active && (
                <div className="w-2 h-2 rounded-full bg-blue-600" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}

      <div className="border-t p-3 space-y-1 dark:border-slate-700">

        {isAdmin && (
          <button
            onClick={() => onNavigate("admin")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-slate-800"
          >
            <ShieldCheck size={20} />
            <span>{translate(language, 'adminPage.admin')}</span>
          </button>
        )}

        <button
          onClick={() => onNavigate("settings")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          <Settings size={20} />
          <span>
            {translate(language, 'sidebar.settings')}
          </span>
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <LogOut size={20} />
          <span>
            {translate(language, 'sidebar.signOut')}
          </span>
        </button>
      </div>
    </aside>
  );
}
