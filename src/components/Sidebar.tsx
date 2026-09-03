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
  const { profile, isAdmin, signOut } = useAuth();
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
    {
      icon: Settings,
      label:
        translate(language, 'sidebar.settings'),
      page: "settings" as Page,
    },
  ];

  return (
    <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 w-56 bg-white border-r border-gray-200 flex-col z-50">

      {/* Logo */}

      <div className="h-16 flex items-center gap-3 px-5 border-b">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>

        <span className="text-xl font-bold text-blue-600">
          マナビ
        </span>
      </div>

      {/* User */}

      <div className="px-5 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {profile?.name?.charAt(0) ?? "U"}
          </div>

          <div className="min-w-0">
            <p className="font-semibold truncate">
              {profile?.name ?? translate(language, 'sidebar.guest')}
            </p>

            <p className="text-xs text-gray-500 truncate">
              {profile?.student_id
                ? profile.student_id
                : profile?.role === "teacher"
                ? translate(language, 'sidebar.teacher')
                : translate(language, 'sidebar.student')}
            </p>
          </div>
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
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100"
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

      <div className="border-t p-3 space-y-1">

        {isAdmin && (
          <button
            onClick={() => onNavigate("admin")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-50"
          >
            <ShieldCheck size={20} />
            <span>{translate(language, 'adminPage.admin')}</span>
          </button>
        )}

        <button
          onClick={() => onNavigate("settings")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100"
        >
          <Settings size={20} />
          <span>
            {translate(language, 'sidebar.settings')}
          </span>
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50"
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
