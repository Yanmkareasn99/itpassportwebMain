import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, BookOpen, Download, ExternalLink, FileText, Image, Link, PlayCircle, Plus, RefreshCw, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { languageLocales, translate } from '../i18n';
import { deleteMaterial, listMaterials, materialUrl, shareMaterialLink, uploadMaterial, validateMaterialFile, validateMaterialLink, type Material } from '../lib/materials';
import { isSupabaseEnabled } from '../lib/supabase';
import { Page } from '../types';

interface MaterialsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

// Pastel card tones taken from the mock-exam screen: periwinkle blue, soft yellow, olive green.
const cardTones = [
  { card: 'bg-[#a9bfea]', shape: 'diamond' },
  { card: 'bg-[#f9e17d]', shape: 'star' },
  { card: 'bg-[#b9c47f]', shape: 'triangle' },
] as const;

function CardDecoration({ shape }: { shape: (typeof cardTones)[number]['shape'] }) {
  if (shape === 'diamond') return <span aria-hidden className="pointer-events-none absolute -right-4 -top-4 h-12 w-12 rotate-45 rounded-md bg-[#88a6de]" />;
  if (shape === 'star') return <Star aria-hidden className="pointer-events-none absolute -right-2 -top-2 h-12 w-12 rotate-12 fill-[#f2d24f] text-[#f2d24f]" />;
  return <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-12 w-12 bg-[#97a65a] [clip-path:polygon(0_0,100%_0,60%_100%)]" />;
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function linkHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export default function MaterialsPage({ currentPage, onNavigate }: MaterialsPageProps) {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(isSupabaseEnabled);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [shareMode, setShareMode] = useState<'file' | 'link'>('file');
  const [externalUrl, setExternalUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    if (!isSupabaseEnabled) return;
    setLoading(true);
    setError('');
    try {
      setMaterials(await listMaterials());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let active = true;
    listMaterials().then(rows => {
      if (active) setMaterials(rows);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : translate(language, 'materialsPage.loadFailed'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  // Reloading is only needed on mount or after a successful upload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingDelete) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelDeleteRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
      previousFocusRef.current = null;
    };
  }, [pendingDelete]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !file || busy) return;
    setError('');
    setMessage('');
    const problem = validateMaterialFile(file);
    if (problem) { setError(t(`materialsPage.${problem}`)); return; }
    if (!title.trim()) { setError(t('materialsPage.titleRequired')); return; }
    setBusy(true);
    try {
      await uploadMaterial(file, title, description);
      setFile(null);
      setTitle('');
      setDescription('');
      const input = document.getElementById('material-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await refresh();
      setMessage(t('materialsPage.uploaded'));
      setShowUploadForm(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy) return;
    setError('');
    setMessage('');
    const problem = validateMaterialLink(externalUrl);
    if (problem) { setError(t(`materialsPage.${problem}`)); return; }
    if (!title.trim()) { setError(t('materialsPage.titleRequired')); return; }
    setBusy(true);
    try {
      await shareMaterialLink(externalUrl, title, description);
      setExternalUrl('');
      setTitle('');
      setDescription('');
      await refresh();
      setMessage(t('materialsPage.linkShared'));
      setShowUploadForm(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.linkShareFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function openMaterial(material: Material, download: boolean) {
    setError('');
    const preview = download ? null : window.open('', '_blank');
    if (preview) preview.opener = null;
    try {
      const url = await materialUrl(material, download);
      if (download) {
        const link = document.createElement('a');
        link.href = url;
        link.download = material.file_name || '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (url.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(url), 0);
      } else if (preview) {
        preview.location.href = url;
        if (url.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        window.location.href = url;
      }
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : t('materialsPage.openFailed'));
    }
  }

  async function handleDelete() {
    if (deletingId || !pendingDelete) return;
    const material = pendingDelete;
    setError('');
    setMessage('');
    setDeletingId(material.id);
    try {
      await deleteMaterial(material);
      setMaterials(current => current.filter(item => item.id !== material.id));
      setMessage(t('materialsPage.deleted'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.deleteFailed'));
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  }

  const inputClass = 'w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={t('materialsPage.materials')} subtitle={t('materialsPage.studyMenu')}>
      <div className="app-shell space-y-6">
        {/* Hero banner: lavender gradient, inline icon title, big faint icon + sparkle, notice inside */}
        <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-[#E9E6FF] via-[#F0EEFF] to-[#FAFAFF] p-6 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:p-8">
          <BookOpen aria-hidden strokeWidth={3} className="pointer-events-none absolute -right-8 -top-6 h-52 w-52 rotate-[18deg] text-indigo-300/30 sm:-right-4 sm:h-64 sm:w-64 dark:text-white/10" />
          <Sparkles aria-hidden strokeWidth={1.75} className="pointer-events-none absolute right-5 top-5 h-6 w-6 text-violet-400 dark:text-indigo-300" />
          <div className="relative">
            <h2 className="flex items-center gap-3 text-2xl font-extrabold uppercase tracking-tight text-indigo-600 dark:text-indigo-300 sm:text-3xl">
              <BookOpen className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" strokeWidth={2.2} />
              {t('materialsPage.materials')}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-300">{t('materialsPage.studentsCanCheckMaterialsAnytimeMakingInformationSharing')}</p>
            {!isSupabaseEnabled && <p role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-sm leading-6 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />{t('materialsPage.requiresSupabase')}</p>}
          </div>
        </section>

        {isSupabaseEnabled && <>
          {error && <p role="alert" className="rounded-2xl bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-200">{error}</p>}
          {message && <p role="status" className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 p-4 text-sm text-emerald-700 dark:text-emerald-200">{message}</p>}

          <section aria-label={t('materialsPage.materials')} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-indigo-950 dark:text-slate-100">{t('materialsPage.sharedFiles')}</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={refresh} disabled={loading} className="flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300 disabled:opacity-50"><RefreshCw className="w-4 h-4" />{t('materialsPage.refresh')}</button>
                <button
                  type="button"
                  onClick={() => setShowUploadForm(current => !current)}
                  aria-expanded={showUploadForm}
                  aria-controls="material-upload-form"
                  aria-label={t('materialsPage.shareMaterial')}
                  title={t('materialsPage.shareMaterial')}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-600 dark:shadow-none"
                >
                  <Plus className={`h-5 w-5 transition-transform ${showUploadForm ? 'rotate-45' : ''}`} />
                </button>
              </div>
            </div>
            {showUploadForm && (
            <form id="material-upload-form" onSubmit={shareMode === 'file' ? handleUpload : handleLinkShare} className="space-y-4 rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-2 rounded-full bg-indigo-50 p-1 dark:bg-slate-800" role="group" aria-label={t('materialsPage.shareType')}>
                <button type="button" onClick={() => setShareMode('file')} aria-pressed={shareMode === 'file'} className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${shareMode === 'file' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-indigo-900/70 dark:text-slate-300'}`}><Upload className="h-4 w-4" />{t('materialsPage.uploadFile')}</button>
                <button type="button" onClick={() => setShareMode('link')} aria-pressed={shareMode === 'link'} className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${shareMode === 'link' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-indigo-900/70 dark:text-slate-300'}`}><Link className="h-4 w-4" />{t('materialsPage.shareLink')}</button>
              </div>
              <p className="text-sm text-indigo-900/70 dark:text-slate-300">{t(shareMode === 'file' ? 'materialsPage.fileHelp' : 'materialsPage.linkHelp')}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-indigo-950 dark:text-slate-200">
                  <span>{t('materialsPage.title')}</span>
                  <input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} className={inputClass} />
                </label>
                {shareMode === 'file' ? <label key="file" className="space-y-2 text-sm font-medium text-indigo-950 dark:text-slate-200">
                  <span>{t('materialsPage.file')}</span>
                  <input id="material-file" required={shareMode === 'file'} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx" onChange={event => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                    if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
                  }} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-600 dark:text-slate-300" />
                </label> : <label key="link" className="space-y-2 text-sm font-medium text-indigo-950 dark:text-slate-200">
                  <span>{t('materialsPage.link')}</span>
                  <input required={shareMode === 'link'} type="url" inputMode="url" maxLength={2048} placeholder="https://drive.google.com/..." value={externalUrl} onChange={event => setExternalUrl(event.target.value)} className={inputClass} />
                </label>}
              </div>
              <label className="block space-y-2 text-sm font-medium text-indigo-950 dark:text-slate-200">
                <span>{t('materialsPage.description')}</span>
                <textarea maxLength={500} rows={2} value={description} onChange={event => setDescription(event.target.value)} className={inputClass} />
              </label>
              <button type="submit" disabled={busy || (shareMode === 'file' ? !file : !externalUrl.trim())} className="rounded-full bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-600 disabled:opacity-50 dark:shadow-none">{busy ? t(shareMode === 'file' ? 'materialsPage.uploading' : 'materialsPage.sharing') : t(shareMode === 'file' ? 'materialsPage.upload' : 'materialsPage.shareLink')}</button>
            </form>
            )}
            {loading ? <p className="text-sm text-indigo-900/70 dark:text-slate-300">{t('ui.loading')}</p> : materials.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-indigo-200 dark:border-slate-700 p-6 text-sm text-indigo-900/70 dark:text-slate-300">{t('materialsPage.empty')}</p>
            ) : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {materials.map((material, index) => {
                const isExternal = Boolean(material.external_url);
                const Icon = isExternal ? ExternalLink : material.mime_type?.startsWith('image/') ? Image : material.mime_type?.startsWith('video/') ? PlayCircle : FileText;
                const tone = cardTones[index % cardTones.length];
                return <article key={material.id} className={`${tone.card} relative flex min-h-[220px] flex-col overflow-hidden rounded-3xl p-5 text-slate-900`}>
                  <CardDecoration shape={tone.shape} />
                  <div className="relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/60 text-slate-900"><Icon className="w-5 h-5" /></div>
                  <h4 className="relative mb-2 break-words text-lg font-bold text-slate-900">{material.title}</h4>
                  {material.description && <p className="relative flex-1 break-words text-sm leading-6 text-slate-700">{material.description}</p>}
                  <p className="relative mt-4 break-all text-xs text-slate-600">{isExternal ? linkHost(material.external_url!) : `${material.file_name} · ${fileSize(material.file_size!)}`}</p>
                  <p className="relative mt-1 text-xs text-slate-600">{new Date(material.created_at).toLocaleDateString(languageLocales[language])}</p>
                  <div className="relative mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openMaterial(material, false)} className={`${isExternal ? 'col-span-2 bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-white/60 text-slate-800 hover:bg-white/80'} flex items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold`}>{isExternal && <ExternalLink className="h-3.5 w-3.5" />}{t(isExternal ? 'materialsPage.openLink' : 'materialsPage.open')}</button>
                    {!isExternal && <button type="button" onClick={() => openMaterial(material, true)} className="flex items-center justify-center gap-1 rounded-full bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"><Download className="w-3.5 h-3.5" />{t('materialsPage.download')}</button>}
                    {(user?.id === material.uploader_id || isAdmin) && <button
                      type="button"
                      onClick={() => setPendingDelete(material)}
                      disabled={deletingId !== null}
                      className="col-span-2 flex items-center justify-center gap-1 rounded-full bg-white/50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-white/80 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingId === material.id ? t('materialsPage.deleting') : t('materialsPage.delete')}
                    </button>}
                  </div>
                </article>;
              })}
            </div>}
          </section>
        </>}
      </div>
      {pendingDelete && createPortal(<div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
        onMouseDown={event => {
          if (event.target === event.currentTarget && !deletingId) setPendingDelete(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-material-title"
          aria-describedby="delete-material-description"
          onKeyDown={event => {
            if (event.key === 'Escape' && !deletingId) setPendingDelete(null);
            if (event.key === 'Tab') {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
          className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="delete-material-title" className="text-lg font-bold text-indigo-950 dark:text-slate-100">{t('materialsPage.deleteDialogTitle')}</h2>
                <p id="delete-material-description" className="mt-1 text-sm leading-6 text-indigo-900/80 dark:text-slate-300">{t('materialsPage.deleteConfirm')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId !== null}
              aria-label={t('materialsPage.cancel')}
              className="rounded-lg p-1.5 text-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="break-words text-sm font-semibold text-indigo-950 dark:text-slate-100">{pendingDelete.title}</p>
            <p className="mt-1 break-all text-xs text-indigo-900/60 dark:text-slate-400">{pendingDelete.external_url || pendingDelete.file_name}</p>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelDeleteRef}
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId !== null}
              className="rounded-full border border-indigo-100 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('materialsPage.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletingId !== null}
              className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deletingId ? t('materialsPage.deleting') : t('materialsPage.delete')}
            </button>
          </div>
        </div>
      </div>, document.body)}
    </Layout>
  );
}