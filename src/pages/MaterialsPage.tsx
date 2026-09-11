import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, ExternalLink, FileText, Trash2, Upload } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { languageLocales, translate, translateMessage } from '../i18n';
import { Page, StudyMaterial } from '../types';
import { deleteStudyMaterial, fetchStudyMaterials, getStudyMaterialUrl, uploadStudyMaterial } from '../lib/materials';

interface MaterialsPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function MaterialsPage({ currentPage, onNavigate }: MaterialsPageProps) {
  const { profile, isAdmin } = useAuth();
  const { language } = useLanguage();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canManageMaterials = Boolean(profile && (isAdmin || profile.role === 'teacher'));
  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [materials],
  );

  function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  const loadMaterials = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      setMaterials(await fetchStudyMaterials());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : translate(language, 'materialsPage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!profile || !file || uploading) return;

    setUploading(true);
    setError('');
    try {
      const material = await uploadStudyMaterial({
        file,
        title,
        description,
        userId: profile.id,
      });
      setMaterials(current => [material, ...current]);
      setTitle('');
      setDescription('');
      setFile(null);
      const input = document.getElementById('material-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : translate(language, 'materialsPage.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function openMaterial(material: StudyMaterial, download: boolean) {
    setBusyId(material.id);
    setError('');
    try {
      const url = await getStudyMaterialUrl(material, download);
      const link = document.createElement('a');
      link.href = url;
      link.target = download ? '_self' : '_blank';
      link.rel = 'noreferrer';
      if (download) link.download = material.file_name;
      link.click();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : translate(language, 'materialsPage.openFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeMaterial(material: StudyMaterial) {
    setBusyId(material.id);
    setError('');
    try {
      await deleteStudyMaterial(material);
      setMaterials(current => current.filter(item => item.id !== material.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : translate(language, 'materialsPage.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'materialsPage.materials')} subtitle={translate(language, 'materialsPage.studyMenu')}>
      <div className="app-shell space-y-6">
        <section className="bg-gradient-to-r from-sky-50 to-blue-100/60 dark:from-slate-900 dark:to-slate-800 rounded-2xl border border-sky-100 dark:border-slate-700 p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">{translate(language, 'materialsPage.materials')}</h2>
                <p className="text-sm text-gray-600 dark:text-slate-300 leading-6 max-w-2xl">{translate(language, 'materialsPage.studentsCanCheckMaterialsAnytimeMakingInformationSharing')}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('practice-list')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
            >
              {translate(language, 'materialsPage.goToPractice')}
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {translateMessage(language, error)}
          </div>
        )}

        {canManageMaterials && (
          <form onSubmit={handleUpload} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-gray-800 dark:text-slate-100">{translate(language, 'materialsPage.uploadMaterial')}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder={translate(language, 'materialsPage.titlePlaceholder')}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-700 dark:text-slate-200"
              />
              <input
                id="material-file"
                type="file"
                onChange={event => setFile(event.target.files?.[0] ?? null)}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-700 dark:text-slate-200"
              />
            </div>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder={translate(language, 'materialsPage.descriptionPlaceholder')}
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-700 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={!file || uploading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? translate(language, 'materialsPage.uploading') : translate(language, 'materialsPage.upload')}
            </button>
          </form>
        )}

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-slate-300">{translate(language, 'ui.loading')}</div>
          ) : sortedMaterials.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{translate(language, 'materialsPage.empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {sortedMaterials.map(material => (
                <article key={material.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-800 dark:text-slate-100 truncate">{material.title}</h3>
                      {material.description && (
                        <p className="text-sm text-gray-500 dark:text-slate-300 leading-6 mt-1">{material.description}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-slate-400 mt-2">
                        {material.file_name} | {formatFileSize(material.file_size)} | {translate(language, 'materialsPage.updated')}: {new Date(material.updated_at).toLocaleDateString(languageLocales[language])}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 lg:shrink-0">
                    <button
                      onClick={() => void openMaterial(material, false)}
                      disabled={busyId === material.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {translate(language, 'materialsPage.open')}
                    </button>
                    <button
                      onClick={() => void openMaterial(material, true)}
                      disabled={busyId === material.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {translate(language, 'materialsPage.download')}
                    </button>
                    {canManageMaterials && (
                      <button
                        onClick={() => void removeMaterial(material)}
                        disabled={busyId === material.id}
                        aria-label={translate(language, 'materialsPage.delete')}
                        className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
