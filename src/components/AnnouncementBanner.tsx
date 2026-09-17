import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Megaphone, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { translate } from '../i18n';
import {
  fetchActiveAnnouncement,
  localizedAnnouncement,
  type Announcement,
} from '../lib/announcements';

const styles = {
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100',
  urgent: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100',
};

export default function AnnouncementBanner() {
  const { language } = useLanguage();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveAnnouncement()
      .then(value => { if (!cancelled) setAnnouncement(value); })
      .catch(error => { console.warn('Unable to load announcement:', error); });
    return () => { cancelled = true; };
  }, []);

  if (!announcement) return null;
  const dismissalKey = `manabi_announcement_dismissed:${announcement.id}:${announcement.updated_at}`;
  if (announcement.severity !== 'urgent' && localStorage.getItem(dismissalKey)) return null;

  const content = localizedAnnouncement(announcement, language);
  const Icon = announcement.severity === 'urgent'
    ? AlertTriangle
    : announcement.severity === 'warning' ? Megaphone : Info;

  return (
    <section
      role={announcement.severity === 'urgent' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm ${styles[announcement.severity]}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {content.title && <h2 className="font-bold">{content.title}</h2>}
        <p className="whitespace-pre-line text-sm leading-relaxed">{content.message}</p>
      </div>
      {announcement.severity !== 'urgent' && (
        <button
          type="button"
          aria-label={translate(language, 'ui.dismiss')}
          onClick={() => {
            localStorage.setItem(dismissalKey, '1');
            setAnnouncement(null);
          }}
          className="rounded-lg p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}
