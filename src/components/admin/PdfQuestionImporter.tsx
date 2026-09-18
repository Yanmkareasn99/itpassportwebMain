import { useMemo, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { translate } from '../../i18n';
import type {
  PdfImportChoice,
  PdfImportQuestion,
} from '../../lib/pdfQuestionImport';
import type { Subject } from '../../types';
import {
  DEFAULT_IT_PASSPORT_SUBJECT_RANGES,
  type ItPassportSubjectRange,
  resolveImportedSubjectId,
  type QuestionImportExam,
  validateItPassportSubjectRanges,
} from '../../lib/questionSubject';

interface PdfQuestionImporterProps {
  subjects: Subject[];
  onClose: () => void;
}

type ReviewPdfImportQuestion = PdfImportQuestion & { subjectId: string };

function questionProblem(question: ReviewPdfImportQuestion) {
  if (!question.subjectId) return 'subject';
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

export default function PdfQuestionImporter({
  subjects,
  onClose,
}: PdfQuestionImporterProps) {
  const { language } = useLanguage();
  const [importExam, setImportExam] = useState<QuestionImportExam>('it-passport');
  const [subjectRanges, setSubjectRanges] = useState<ItPassportSubjectRange[]>(() => (
    DEFAULT_IT_PASSPORT_SUBJECT_RANGES.map(range => ({ ...range }))
  ));
  const [examKey, setExamKey] = useState('');
  const [examDate, setExamDate] = useState('');
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<ReviewPdfImportQuestion[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const subjectRangesValid = useMemo(
    () => validateItPassportSubjectRanges(subjectRanges),
    [subjectRanges],
  );
  const invalidCount = useMemo(
    () => questions.filter(question => questionProblem(question)).length,
    [questions],
  );
  const imageSizeMb = useMemo(
    () => questions.reduce((sum, question) => sum + question.imageDataUrl.length * 0.75, 0) / 1024 / 1024,
    [questions],
  );
  const subjectNames = useMemo(
    () => new Map(subjects.map(subject => [subject.id, subject.name])),
    [subjects],
  );

  function patchQuestion(index: number, patch: Partial<ReviewPdfImportQuestion>) {
    setQuestions(current => current.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    ));
  }

  function detectedSubjectId(
    questionNumber: number,
    exam = importExam,
    ranges = subjectRanges,
  ) {
    const detected = resolveImportedSubjectId(
      null,
      questionNumber,
      subjects.map(subject => subject.id),
      exam,
      ranges,
    );
    return detected ?? '';
  }

  function updateSubjectRange(
    rangeIndex: number,
    field: 'from' | 'to',
    value: number,
  ) {
    const nextRanges = subjectRanges.map((range, index) => (
      index === rangeIndex ? { ...range, [field]: value } : range
    ));
    setSubjectRanges(nextRanges);
    if (importExam === 'it-passport') {
      setQuestions(current => current.map(question => ({
        ...question,
        subjectId: detectedSubjectId(question.number, 'it-passport', nextRanges),
      })));
    }
    setError('');
    setSuccess('');
  }

  function changeImportExam(exam: QuestionImportExam) {
    setImportExam(exam);
    setQuestions(current => current.map(question => ({
      ...question,
      subjectId: detectedSubjectId(question.number, exam),
    })));
    setError('');
    setSuccess('');
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
    if (importExam === 'it-passport' && !subjectRangesValid) {
      setError(translate(language, 'adminPage.pdfInvalidSubjectRanges'));
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
        importExam,
      );
      setQuestions(result.questions.map(question => ({
        ...question,
        subjectId: detectedSubjectId(question.number),
      })));
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

  async function handleDownloadCsv() {
    setError('');
    setSuccess('');
    if (importExam === 'it-passport' && !subjectRangesValid) {
      setError(translate(language, 'adminPage.pdfInvalidSubjectRanges'));
      return;
    }
    if (!examDate) {
      setError(translate(language, 'adminPage.examDateRequired'));
      return;
    }
    if (!questions.length || invalidCount) {
      setError(translate(language, 'adminPage.pdfFixReviewErrors'));
      return;
    }

    try {
      const { createPdfImportCsvFiles } = await import('../../lib/pdfQuestionCsv');
      const files = createPdfImportCsvFiles(questions, examDate);
      const safeExamKey = examKey.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      for (const [filename, csv] of [
        [`${safeExamKey}-questions.csv`, files.questionsCsv],
        [`${safeExamKey}-answer-choices.csv`, files.answerChoicesCsv],
      ] as const) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      setSuccess(translate(language, 'adminPage.pdfCsvDownloaded', { count: questions.length }));
    } catch (downloadError) {
      setError(downloadError instanceof Error
        ? downloadError.message
        : translate(language, 'adminPage.pdfCsvDownloadFailed'));
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
        <label className="block text-xs font-semibold text-gray-600 md:col-span-2">
          {translate(language, 'adminPage.pdfExamType')}
          <select
            value={importExam}
            onChange={event => changeImportExam(event.target.value as QuestionImportExam)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="it-passport">{translate(language, 'adminPage.pdfExamItPassport')}</option>
            <option value="fundamental-a">{translate(language, 'adminPage.pdfExamFundamentalA')}</option>
            <option value="fundamental-b">{translate(language, 'adminPage.pdfExamFundamentalB')}</option>
          </select>
          <span className="mt-1 block font-normal text-gray-500">
            {translate(language, importExam === 'it-passport'
              ? 'adminPage.pdfSubjectDetectionHelp'
              : importExam === 'fundamental-a'
                ? 'adminPage.pdfSubjectDetectionFundamentalA'
                : 'adminPage.pdfSubjectDetectionFundamentalB')}
          </span>
        </label>
        {importExam === 'it-passport' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 md:col-span-2">
            <p className="text-xs font-semibold text-gray-700">
              {translate(language, 'adminPage.pdfSubjectRanges')}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {translate(language, 'adminPage.pdfSubjectRangesHelp')}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {subjectRanges.map((range, rangeIndex) => (
                <div key={range.subjectId} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="truncate text-xs font-semibold text-gray-700">
                    {subjectNames.get(range.subjectId) ?? translate(language, 'adminPage.subject')}
                  </p>
                  <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <label className="text-[11px] text-gray-500">
                      {translate(language, 'adminPage.pdfRangeFrom')}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={range.from || ''}
                        onChange={event => updateSubjectRange(rangeIndex, 'from', Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                    </label>
                    <span className="pb-2 text-gray-400">–</span>
                    <label className="text-[11px] text-gray-500">
                      {translate(language, 'adminPage.pdfRangeTo')}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={range.to || ''}
                        onChange={event => updateSubjectRange(rangeIndex, 'to', Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {!subjectRangesValid && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                {translate(language, 'adminPage.pdfInvalidSubjectRanges')}
              </p>
            )}
          </div>
        )}
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
          {translate(language, 'adminPage.examDate')}
          <input
            type="date"
            value={examDate}
            onChange={event => setExamDate(event.target.value)}
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
          disabled={processing}
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
              onClick={handleDownloadCsv}
              disabled={invalidCount > 0 || (importExam === 'it-passport' && !subjectRangesValid)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {translate(language, 'adminPage.pdfDownloadCsv')}
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
                    : problem === 'subject'
                      ? translate(language, 'adminPage.pleaseSelectASubject')
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
                    <span className="max-w-32 shrink-0 truncate rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">
                      {subjectNames.get(question.subjectId) ?? translate(language, 'adminPage.subject')}
                    </span>
                    <span className="w-14 shrink-0 text-sm font-bold text-gray-700">問 {question.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                      {problemText || `${question.choices.length} ${translate(language, 'adminPage.choices')} · PDF ${question.sourcePages.join(', ')}`}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </button>

                  {expanded && (
                    <div className="space-y-4 p-4">
                      <label className="block text-xs font-semibold text-gray-600">
                        {translate(language, 'adminPage.subject')}
                        <select
                          value={question.subjectId}
                          onChange={event => patchQuestion(questionIndex, { subjectId: event.target.value })}
                          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        >
                          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                        </select>
                      </label>
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
