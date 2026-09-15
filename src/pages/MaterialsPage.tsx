import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, BookOpen, Download, FileText, Image, PlayCircle, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { languageLocales, translate } from '../i18n';
import { deleteMaterial, listMaterials, materialUrl, uploadMaterial, validateMaterialFile, type Material } from '../lib/materials';
import { isSupabaseEnabled } from '../lib/supabase';
import { Page } from '../types';

interface MaterialsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.uploadFailed'));
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
        link.download = material.file_name;
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
      await deleteMaterial(material.id);
      setMaterials(current => current.filter(item => item.id !== material.id));
      setMessage(t('materialsPage.deleted'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('materialsPage.deleteFailed'));
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={t('materialsPage.materials')} subtitle={t('materialsPage.studyMenu')}>
      <div className="app-shell space-y-6">
        <section className="bg-gradient-to-r from-sky-50 to-blue-100/60 dark:from-slate-900 dark:to-slate-800 rounded-2xl border border-sky-100 dark:border-slate-700 p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0"><BookOpen className="w-6 h-6" /></div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">{t('materialsPage.materials')}</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 leading-6 max-w-2xl">{t('materialsPage.studentsCanCheckMaterialsAnytimeMakingInformationSharing')}</p>
            </div>
          </div>
        </section>

        {!isSupabaseEnabled ? <p role="status" className="rounded-xl bg-amber-50 dark:bg-amber-900/30 p-5 text-sm text-amber-900 dark:text-amber-200">{t('materialsPage.requiresSupabase')}</p> : <>
          <form onSubmit={handleUpload} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2"><Upload className="w-5 h-5" />{t('materialsPage.upload')}</h3>
            <p className="text-sm text-gray-500 dark:text-slate-300">{t('materialsPage.fileHelp')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-200 space-y-2">
                <span>{t('materialsPage.title')}</span>
                <input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white" />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-slate-200 space-y-2">
                <span>{t('materialsPage.file')}</span>
                <input id="material-file" required type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx" onChange={event => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
                }} className="block w-full text-sm text-gray-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700" />
              </label>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 space-y-2">
              <span>{t('materialsPage.description')}</span>
              <textarea maxLength={500} rows={2} value={description} onChange={event => setDescription(event.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white" />
            </label>
            <button type="submit" disabled={busy || !file} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? t('materialsPage.uploading') : t('materialsPage.upload')}</button>
          </form>

          {error && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-200">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-4 text-sm text-emerald-700 dark:text-emerald-200">{message}</p>}

          <section aria-label={t('materialsPage.materials')} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">{t('materialsPage.sharedFiles')}</h3>
              <button onClick={refresh} disabled={loading} className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-300 disabled:opacity-50"><RefreshCw className="w-4 h-4" />{t('materialsPage.refresh')}</button>
            </div>
            {loading ? <p className="text-sm text-gray-500 dark:text-slate-300">{t('ui.loading')}</p> : materials.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-6 text-sm text-gray-500 dark:text-slate-300">{t('materialsPage.empty')}</p>
            ) : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {materials.map(material => {
                const Icon = material.mime_type.startsWith('image/') ? Image : material.mime_type.startsWith('video/') ? PlayCircle : FileText;
                return <article key={material.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5 flex flex-col min-h-[220px]">
                  <div className="w-11 h-11 rounded-xl border bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 flex items-center justify-center mb-4"><Icon className="w-5 h-5" /></div>
                  <h4 className="font-bold text-gray-800 dark:text-slate-100 mb-2 break-words">{material.title}</h4>
                  {material.description && <p className="text-sm text-gray-500 dark:text-slate-300 leading-6 flex-1 break-words">{material.description}</p>}
                  <p className="text-xs text-gray-400 dark:text-slate-400 mt-4 break-all">{material.file_name} · {fileSize(material.file_size)}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-400 mt-1">{new Date(material.created_at).toLocaleDateString(languageLocales[language])}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => openMaterial(material, false)} className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-700">{t('materialsPage.open')}</button>
                    <button onClick={() => openMaterial(material, true)} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 flex items-center justify-center gap-1"><Download className="w-3.5 h-3.5" />{t('materialsPage.download')}</button>
                    {(user?.id === material.uploader_id || isAdmin) && <button
                      onClick={() => setPendingDelete(material)}
                      disabled={deletingId !== null}
                      className="col-span-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 flex items-center justify-center gap-1"
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
      {pendingDelete && <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
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
          className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="delete-material-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{t('materialsPage.deleteDialogTitle')}</h2>
                <p id="delete-material-description" className="mt-1 text-sm leading-6 text-gray-600 dark:text-slate-300">{t('materialsPage.deleteConfirm')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId !== null}
              aria-label={t('materialsPage.cancel')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="break-words text-sm font-semibold text-gray-800 dark:text-slate-100">{pendingDelete.title}</p>
            <p className="mt-1 break-all text-xs text-gray-500 dark:text-slate-400">{pendingDelete.file_name}</p>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelDeleteRef}
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId !== null}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t('materialsPage.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletingId !== null}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deletingId ? t('materialsPage.deleting') : t('materialsPage.delete')}
            </button>
          </div>
        </div>
      </div>}
    </Layout>
  );
}
