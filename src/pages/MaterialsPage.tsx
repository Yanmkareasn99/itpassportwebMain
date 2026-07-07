import { BookOpen, Download, FileText, Link as LinkIcon, PlayCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Page } from '../types';

interface MaterialsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const materials = [
  {
    type: 'pdf',
    title: 'ITパスポート 重要用語まとめ',
    description: 'ストラテジ、マネジメント、テクノロジの基礎用語を確認できます。',
    icon: FileText,
    color: 'blue',
  },
  {
    type: 'video',
    title: '過去問の解き方ガイド',
    description: '選択肢の読み方と時間配分のコツを短い動画で確認できます。',
    icon: PlayCircle,
    color: 'emerald',
  },
  {
    type: 'link',
    title: '授業スライド一覧',
    description: '授業で使ったスライドや補足資料をいつでも見返せます。',
    icon: LinkIcon,
    color: 'amber',
  },
];

export default function MaterialsPage({ currentPage, onNavigate }: MaterialsPageProps) {
  const { language } = useLanguage();
  const text = {
    title: language === 'ja' ? '教材' : language === 'en' ? 'Materials' : 'Tai lieu',
    subtitle: language === 'ja' ? '学習メニュー' : language === 'en' ? 'Study menu' : 'Menu học tập',
    lead: language === 'ja'
      ? '学生はいつでも教材を確認できるため、情報共有がスムーズになります。'
      : language === 'en'
      ? 'Students can check materials anytime, making information sharing smoother.'
      : 'Sinh viên có thể xem tài liệu bất cứ lúc nào, giúp việc chia sẻ thông tin trở nên thuận tiện hơn.',
    open: language === 'ja' ? '確認する' : language === 'en' ? 'Open' : 'Mở',
    download: language === 'ja' ? 'ダウンロード' : language === 'en' ? 'Download' : 'Tải xuống',
    practice: language === 'ja' ? '問題演習へ' : language === 'en' ? 'Go to practice' : 'rèn luyện',
    updated: language === 'ja' ? '最終更新' : language === 'en' ? 'Updated' : 'Cập nhật',
  };

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={text.title} subtitle={text.subtitle}>
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="bg-gradient-to-r from-sky-50 to-blue-100/60 rounded-2xl border border-sky-100 p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">{text.title}</h2>
                <p className="text-sm text-gray-600 leading-6 max-w-2xl">{text.lead}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('practice-list')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
            >
              {text.practice}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {materials.map(item => {
            const Icon = item.icon;
            const colorClass =
              item.color === 'emerald'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                : item.color === 'amber'
                ? 'bg-amber-50 text-amber-600 border-amber-100'
                : 'bg-blue-50 text-blue-600 border-blue-100';

            return (
              <article key={item.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col min-h-[230px]">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-800 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-6 flex-1">{item.description}</p>
                <p className="text-xs text-gray-400 mt-4">{text.updated}: 2026/07/06</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition">
                    {text.open}
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-1">
                    <Download className="w-3.5 h-3.5" />
                    {text.download}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </Layout>
  );
}