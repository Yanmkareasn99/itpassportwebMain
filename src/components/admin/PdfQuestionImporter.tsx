import { useMemo, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { translate } from '../../i18n';
import { isSupabaseEnabled, supabase } from '../../lib/supabase';
import type {
  PdfImportChoice,
  PdfImportQuestion,
} from '../../lib/pdfQuestionImport';
import type { Subject } from '../../types';

interface PdfQuestionImporterProps {
  subjects: Subject[];
  onClose: () => void;
  onImported: () => Promise<void>;
}

function questionProblem(question: PdfImportQuestion) {
  if (!question.questionText.trim()) return 'text';
  if (question.choices.length < 2) return 'choices';
  if (!question.correctChoice || !question.choices.some(choice => choice.label === question.correctChoice)) {
    return 'correct';
  }
  return '';
}

function nextChoiceLabel(choices: PdfImportChoice[]) {
  const labels = 'アイウエオカキクケコ';
  return [...labels].find(label => !choices.some(choice => choice.label === label))
    ?? String(choices.length + 1);
}

async function uploadQuestionImage(question: PdfImportQuestion, examKey: string) {
  const response = await fetch(question.imageDataUrl);
  const blob = await response.blob();
  const safeExamKey = examKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  const extension = blob.type === 'image/png' ? 'png' : 'webp';
  const path = `${safeExamKey}/question-${question.number}.${extension}`;
  const { error } = await supabase.storage
    .from('question-images')
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl;
}

export default function PdfQuestionImporter({
  subjects,
  onClose,
  onImported,
}: PdfQuestionImporterProps) {
  const { language } = useLanguage();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [examKey, setExamKey] = useState('');
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<PdfImportQuestion[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const invalidCount = useMemo(
    () => questions.filter(question => questionProblem(question)).length,
    [questions],
  );
  const imageSizeMb = useMemo(
    () => questions.reduce((sum, question) => sum + question.imageDataUrl.length * 0.75, 0) / 1024 / 1024,
    [questions],
  );

  function patchQuestion(index: number, patch: Partial<PdfImportQuestion>) {
    setQuestions(current => current.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    ));
  }

  function patchChoice(questionIndex: number, choiceIndex: number, patch: Partial<PdfImportChoice>) {
    setQuestions(current => current.map((question, currentQuestionIndex) => {
      if (currentQuestionIndex !== questionIndex) return question;
      return {
        ...question,
        choices: question.choices.map((choice, currentChoiceIndex) =>
          currentChoiceIndex === choiceIndex ? { ...choice, ...patch } : choice,
        ),
      };
    }));
  }

  function addChoice(questionIndex: number) {
    setQuestions(current => current.map((question, currentIndex) => {
      if (currentIndex !== questionIndex) return question;
      const label = nextChoiceLabel(question.choices);
      return {
        ...question,
        choices: [...question.choices, { label, text: label, sortOrder: question.choices.length + 1 }],
      };
    }));
  }

  function removeChoice(questionIndex: number, choiceIndex: number) {
    setQuestions(current => current.map((question, currentIndex) => {
      if (currentIndex !== questionIndex) return question;
      const removed = question.choices[choiceIndex];
      return {
        ...question,
        correctChoice: question.correctChoice === removed.label ? '' : question.correctChoice,
        choices: question.choices
          .filter((_, index) => index !== choiceIndex)
          .map((choice, index) => ({ ...choice, sortOrder: index + 1 })),
      };
    }));
  }

  async function handleProcess() {
    setError('');
    setSuccess('');
    if (!questionFile) {
      setError(translate(language, 'adminPage.pdfChooseQuestion'));
      return;
    }
    if (!examKey.trim()) {
      setError(translate(language, 'adminPage.pdfEnterExamKey'));
      return;
    }
    setProcessing(true);
    setQuestions([]);
    try {
      const { processExamPdfs } = await import('../../lib/pdfQuestionImport');
      const result = await processExamPdfs(
        questionFile,
        answerFile,
        examKey.trim(),
        setProgress,
      );
      setQuestions(result.questions);
      setExpandedIndex(result.questions.length ? 0 : null);
      setProgress('');
      if (!result.answerCount) {
        setError(translate(language, 'adminPage.pdfAnswersNotDetected'));
      }
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : translate(language, 'adminPage.pdfProcessingFailed'));
    } finally {
      setProcessing(false);
    }
  }

  async function handleImport() {
    setError('');
    setSuccess('');
    if (!isSupabaseEnabled) {
      setError(translate(language, 'adminPage.pdfRequiresSupabase'));
      return;
    }
    if (!subjectId) {
      setError(translate(language, 'adminPage.pleaseSelectASubject'));
      return;
    }
    if (!questions.length || invalidCount) {
      setError(translate(language, 'adminPage.pdfFixReviewErrors'));
      return;
    }

    setImporting(true);
    try {
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        setProgress(translate(language, 'adminPage.pdfImportProgress', {
          current: index + 1,
          total: questions.length,
        }));
        const imageUrl = await uploadQuestionImage(question, examKey.trim());
        const answerChoices = question.choices.map((choice, choiceIndex) => ({
          label: choice.label,
          text: choice.text.trim() || choice.label,
          image_url: null,
          is_correct: choice.label === question.correctChoice,
          sort_order: choiceIndex + 1,
        }));
        const { error: importError } = await supabase.from('question_import_staging').insert({
          source_key: question.sourceKey,
          subject_id: subjectId,
          question_number: question.number,
          question_text: question.questionText.trim(),
          question_type: 'multiple_choice',
          image_url: imageUrl,
          answer_choices: answerChoices,
          explanation: question.explanation.trim() || null,
          explanation_ja: question.explanation.trim() || null,
          explanation_en: null,
          explanation_vi: null,
          difficulty: question.difficulty,
          points: question.points,
        });
        if (importError) {
          if (importError.message.includes('question_import_staging')) {
            throw new Error(translate(language, 'adminPage.pdfMigrationRequired'));
          }
          throw importError;
        }
      }
      setProgress('');
      setSuccess(translate(language, 'adminPage.pdfImportComplete', { count: questions.length }));
      await onImported();
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : '';
      setError(
        /question_import_staging|question-images|bucket not found/i.test(message)
          ? translate(language, 'adminPage.pdfMigrationRequired')
          : message || translate(language, 'adminPage.pdfImportFailed'),
      );
    } finally {
      setProgress('');
      setImporting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
            <FileText className="h-5 w-5 text-violet-600" />
            {translate(language, 'adminPage.pdfImportTitle')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{translate(language, 'adminPage.pdfImportDescription')}</p>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-600">
          {translate(language, 'adminPage.subject')}
          <select
            value={subjectId}
            onChange={event => setSubjectId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          {translate(language, 'adminPage.pdfExamKey')}
          <input
            value={examKey}
            onChange={event => setExamKey(event.target.value.replace(/\s/g, ''))}
            placeholder="2026B"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          {translate(language, 'adminPage.pdfQuestionFile')}
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={event => setQuestionFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-violet-700"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          {translate(language, 'adminPage.pdfAnswerFile')}
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={event => setAnswerFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-violet-700"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleProcess}
          disabled={processing || importing}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          {processing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {processing ? progress || translate(language, 'adminPage.pdfProcessing') : translate(language, 'adminPage.pdfProcess')}
        </button>
        <p className="text-xs text-gray-500">{translate(language, 'adminPage.pdfLocalProcessing')}</p>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800">
                {translate(language, 'adminPage.pdfReviewCount', { count: questions.length })}
              </h3>
              <p className={`mt-0.5 text-xs ${invalidCount ? 'text-amber-700' : 'text-emerald-700'}`}>
                {invalidCount
                  ? translate(language, 'adminPage.pdfReviewProblems', { count: invalidCount })
                  : translate(language, 'adminPage.pdfReadyToImport')}
                {' · '}{imageSizeMb.toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={handleImport}
              disabled={importing || invalidCount > 0}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? progress : translate(language, 'adminPage.pdfImportButton')}
            </button>
          </div>

          <div className="space-y-2">
            {questions.map((question, questionIndex) => {
              const expanded = expandedIndex === questionIndex;
              const problem = questionProblem(question);
              const problemText = problem === 'text'
                ? translate(language, 'adminPage.pleaseEnterTheQuestionText')
                : problem === 'choices'
                  ? translate(language, 'adminPage.enterAtLeastTwoChoices')
                  : problem === 'correct'
                    ? translate(language, 'adminPage.selectAtLeastOneCorrectChoice')
                    : '';
              return (
                <div key={question.sourceKey} className={`overflow-hidden rounded-xl border ${problem ? 'border-amber-200' : 'border-gray-200'}`}>
                  <button
                    onClick={() => setExpandedIndex(expanded ? null : questionIndex)}
                    className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100"
                  >
                    {problem
                      ? <XCircle className="h-4 w-4 shrink-0 text-amber-500" />
                      : <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
                    <span className="w-14 shrink-0 text-sm font-bold text-gray-700">問 {question.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                      {problemText || `${question.choices.length} ${translate(language, 'adminPage.choices')} · PDF ${question.sourcePages.join(', ')}`}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </button>

                  {expanded && (
                    <div className="space-y-4 p-4">
                      <div className="max-h-[34rem] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                        <img src={question.imageDataUrl} alt={`Question ${question.number} PDF preview`} className="mx-auto h-auto max-w-full" />
                      </div>
                      <label className="block text-xs font-semibold text-gray-600">
                        {translate(language, 'adminPage.questionText')}
                        <textarea
                          value={question.questionText}
                          onChange={event => patchQuestion(questionIndex, { questionText: event.target.value })}
                          rows={6}
                          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                      </label>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600">{translate(language, 'adminPage.choices')}</span>
                          <button onClick={() => addChoice(questionIndex)} className="flex items-center gap-1 text-xs font-semibold text-violet-600">
                            <Plus className="h-3.5 w-3.5" /> {translate(language, 'adminPage.add')}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {question.choices.map((choice, choiceIndex) => (
                            <div key={`${choice.label}-${choiceIndex}`} className="flex items-center gap-2">
                              <button
                                onClick={() => patchQuestion(questionIndex, { correctChoice: choice.label })}
                                title={translate(language, 'adminPage.pdfMarkCorrect')}
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                                  question.correctChoice === choice.label
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-gray-300 text-gray-500 hover:border-emerald-400'
                                }`}
                              >
                                {choice.label}
                              </button>
                              <input
                                value={choice.text}
                                onChange={event => patchChoice(questionIndex, choiceIndex, { text: event.target.value })}
                                className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                              />
                              <button
                                onClick={() => removeChoice(questionIndex, choiceIndex)}
                                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <label className="block text-xs font-semibold text-gray-600">
                        {translate(language, 'adminPage.explanationJapanese')}
                        <textarea
                          value={question.explanation}
                          onChange={event => patchQuestion(questionIndex, { explanation: event.target.value })}
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
