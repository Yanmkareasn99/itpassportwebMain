import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Page } from '../types';

interface LayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  title: string;
  subtitle?: string;
}

export default function Layout({
  children,
  currentPage,
  onNavigate,
  title,
  subtitle,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <div className="ml-56 min-h-screen flex flex-col">
        <Header title={title} subtitle={subtitle} />

        <main className="flex-1 p-4 sm:p-5 lg:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}