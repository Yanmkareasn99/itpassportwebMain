import { useState } from 'react';
import { BarChart2, BookOpen, Layers, Megaphone, Users, type LucideIcon } from 'lucide-react';
import Layout from '../components/Layout';
import QuestionsTab from '../components/admin/tabs/QuestionsTab';
import MockExamTab from '../components/admin/tabs/MockExamTab';
import StatsTab from '../components/admin/tabs/StatsTab';
import SubjectsTab from '../components/admin/tabs/SubjectsTab';
import UsersTab from '../components/admin/tabs/UsersTab';
import AnnouncementsTab from '../components/admin/tabs/AnnouncementsTab';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translate } from '../i18n';
import { Page } from '../types';

interface AdminPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

type Tab = 'questions' | 'subjects' | 'users' | 'stats' | 'mock-exam' | 'announcements';

const tabs: { id: Tab; labelKey: Parameters<typeof translate>[1]; icon: LucideIcon }[] = [
  { id: 'questions', labelKey: 'adminPage.questions', icon: BookOpen },
  { id: 'subjects', labelKey: 'adminPage.subjects', icon: Layers },
  { id: 'users', labelKey: 'adminPage.users', icon: Users },
  { id: 'announcements', labelKey: 'adminPage.announcements', icon: Megaphone },
  { id: 'mock-exam', labelKey: 'mockExamPage.mockExam', icon: BookOpen },
  { id: 'stats', labelKey: 'adminPage.stats', icon: BarChart2 },
];

export default function AdminPage({ currentPage, onNavigate }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('questions');
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(['questions']));
  const { language } = useLanguage();
  const { isAdmin } = useAuth();

  function openTab(nextTab: Tab) {
    setTab(nextTab);
    setMountedTabs(current => {
      if (current.has(nextTab)) return current;
      const next = new Set(current);
      next.add(nextTab);
      return next;
    });
  }

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(language, 'adminPage.admin')}
      subtitle={translate(language, 'adminPage.admin')}
    >
      <div className="app-shell">
        {!isAdmin ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-100 dark:border-red-900/50 shadow-sm p-6 text-sm text-red-600 dark:text-red-300">
            {translate(language, 'adminPage.adminAccessRequired')}
          </div>
        ) : (
          <>
            <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
              {tabs.map(({ id, labelKey, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => openTab(id)}
                  aria-pressed={tab === id}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition shrink-0 whitespace-nowrap ${
                    tab === id
                      ? 'bg-white text-gray-800 shadow-sm dark:bg-slate-600 dark:text-slate-50 dark:shadow-none'
                      : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {translate(language, labelKey)}
                </button>
              ))}
            </div>

            <div className={tab === 'questions' ? '' : 'hidden'}>
              {mountedTabs.has('questions') && <QuestionsTab active={tab === 'questions'} />}
            </div>
            <div className={tab === 'subjects' ? '' : 'hidden'}>
              {mountedTabs.has('subjects') && <SubjectsTab />}
            </div>
            <div className={tab === 'users' ? '' : 'hidden'}>
              {mountedTabs.has('users') && <UsersTab />}
            </div>
            <div className={tab === 'mock-exam' ? '' : 'hidden'}>
              {mountedTabs.has('mock-exam') && <MockExamTab />}
            </div>
            <div className={tab === 'announcements' ? '' : 'hidden'}>
              {mountedTabs.has('announcements') && <AnnouncementsTab />}
            </div>
            <div className={tab === 'stats' ? '' : 'hidden'}>
              {mountedTabs.has('stats') && <StatsTab />}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}