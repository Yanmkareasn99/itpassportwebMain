import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import PdfQuestionImporter from "../PdfQuestionImporter";
import { translate } from "../../../i18n";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getLocalizedExplanation } from "../../../lib/localizedQuestion";
import { readCsvFile } from "../../../lib/csv";
import { supabase } from "../../../lib/supabase";
import type { AnswerChoice, Question, Subject } from "../../../types";
import {
  emptyQuestionForm,
  type ChoiceForm,
  type CsvImportData,
  type QuestionForm,
} from "../forms";
import { resolveImportedSubjectId } from "../../../lib/questionSubject";
import { findDuplicateQuestionKeys } from "../../../lib/questionDuplicates";
import { getPdfImportJobSnapshot } from "../../../lib/pdfImportJob";

const QUESTION_FETCH_PAGE_SIZE = 1000;
const QUESTION_LIST_PAGE_SIZE = 50;

function parseQuestionPoints(value: string, fallback = 1) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchAllQuestions(): Promise<Question[]> {
  const questions: Question[] = [];

  for (let from = 0; ; from += QUESTION_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("id")
      .range(from, from + QUESTION_FETCH_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as Question[];
    questions.push(...page);
    if (page.length < QUESTION_FETCH_PAGE_SIZE) break;
  }

  return questions.sort(
    (left, right) =>
      left.question_number - right.question_number ||
      left.id.localeCompare(right.id),
  );
}

function DiffBadge({ d }: { d: number }) {
  const { language } = useLanguage();
  const map = [
    "",
    "bg-emerald-100 text-emerald-700",
    "bg-blue-100 text-blue-700",
    "bg-amber-100 text-amber-700",
    "bg-orange-100 text-orange-700",
    "bg-red-100 text-red-700",
  ];
  const label = [
    "",
    translate(language, "adminPage.easy"),
    translate(language, "adminPage.starter"),
    translate(language, "adminPage.mid"),
    translate(language, "adminPage.hard"),
    translate(language, "adminPage.expert"),
  ];
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[d] ?? map[3]}`}
    >
      {label[d] ?? d}
    </span>
  );
}
export default function QuestionsTab() {
  const { language } = useLanguage();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<QuestionForm>(emptyQuestionForm());
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [choicesByQuestion, setChoicesByQuestion] = useState<
    Record<string, AnswerChoice[]>
  >({});
  const [loadingChoicesId, setLoadingChoicesId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [error, setError] = useState("");
  const [importData, setImportData] = useState<CsvImportData | null>(null);
  const [importing, setImporting] = useState(false);
  const [showPdfImporter, setShowPdfImporter] = useState(
    () => getPdfImportJobSnapshot().status !== "idle",
  );
  const [showQuestionInputMenu, setShowQuestionInputMenu] = useState(false);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvSubjectId, setCsvSubjectId] = useState("");
  const [csvFileNames, setCsvFileNames] = useState({
    questions: "",
    choices: "",
  });
  const questionCsvInput = useRef<HTMLInputElement>(null);
  const choiceCsvInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [qs, { data: ss, error: subjectError }] = await Promise.all([
        fetchAllQuestions(),
        supabase.from("subjects").select("*").order("name"),
      ]);
      if (subjectError) throw subjectError;
      setQuestions(qs);
      setSubjects((ss ?? []) as Subject[]);
      setChoicesByQuestion({});
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load questions.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return questions.filter((q) => {
      const matchSub =
        filterSubject === "all" || q.subject_id === filterSubject;
      const matchSearch =
        !normalizedSearch ||
        q.question_text.toLocaleLowerCase().includes(normalizedSearch) ||
        String(q.question_number).includes(normalizedSearch);
      return matchSub && matchSearch;
    });
  }, [filterSubject, questions, search]);
  const subjectById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );
  const listPageCount = Math.max(
    1,
    Math.ceil(filtered.length / QUESTION_LIST_PAGE_SIZE),
  );
  const currentListPage = Math.min(listPage, listPageCount);
  const visibleQuestions = useMemo(
    () =>
      filtered.slice(
        (currentListPage - 1) * QUESTION_LIST_PAGE_SIZE,
        currentListPage * QUESTION_LIST_PAGE_SIZE,
      ),
    [currentListPage, filtered],
  );

  function startNew() {
    const defaultSubject = subjects[0]?.id ?? "";
    setForm({
      ...emptyQuestionForm(),
      subject_id: defaultSubject,
      question_number: String(getNextQuestionNumber(defaultSubject)),
    });
    setEditingId("new");
    setError("");
  }

  function getNextQuestionNumber(subjectId: string) {
    if (!subjectId) return 1;
    return (
      questions
        .filter((q) => q.subject_id === subjectId)
        .reduce((highest, q) => Math.max(highest, q.question_number), 0) + 1
    );
  }

  async function loadChoices(questionId: string) {
    if (Object.prototype.hasOwnProperty.call(choicesByQuestion, questionId)) {
      return choicesByQuestion[questionId];
    }
    setLoadingChoicesId(questionId);
    try {
      const { data, error: choiceError } = await supabase
        .from("answer_choices")
        .select("*")
        .eq("question_id", questionId)
        .order("sort_order");
      if (choiceError) throw choiceError;
      const choices = (data ?? []) as AnswerChoice[];
      setChoicesByQuestion((current) => ({
        ...current,
        [questionId]: choices,
      }));
      return choices;
    } finally {
      setLoadingChoicesId((current) =>
        current === questionId ? null : current,
      );
    }
  }

  async function startEdit(q: Question) {
    setError("");
    let loadedChoices: AnswerChoice[];
    try {
      loadedChoices = await loadChoices(q.id);
    } catch (choiceError) {
      setError(
        choiceError instanceof Error
          ? choiceError.message
          : translate(language, "adminPage.failedToSave"),
      );
      return;
    }
    const choices: ChoiceForm[] = loadedChoices.map((c) => ({
      id: c.id,
      choice_text: c.choice_text,
      is_correct: c.is_correct,
      sort_order: c.sort_order,
    }));
    setForm({
      subject_id: q.subject_id,
      question_number: String(q.question_number),
      question_text: q.question_text,
      question_type: q.question_type as QuestionForm["question_type"],
      explanation: q.explanation ?? "",
      explanation_en: q.explanation_en ?? "",
      explanation_vi: q.explanation_vi ?? "",
      exam_date: q.exam_date ?? "",
      difficulty: q.difficulty ?? 3,
      points: q.points ?? 1,
      image_url: q.image_url ?? "",
      choices,
    });
    setEditingId(q.id);
    setError("");
  }

  async function startDuplicate(q: Question) {
    setError("");
    let loadedChoices: AnswerChoice[];
    try {
      loadedChoices = await loadChoices(q.id);
    } catch (choiceError) {
      setError(
        choiceError instanceof Error
          ? choiceError.message
          : translate(language, "adminPage.failedToSave"),
      );
      return;
    }
    const choices: ChoiceForm[] = loadedChoices.map((c) => ({
      choice_text: c.choice_text,
      is_correct: c.is_correct,
      sort_order: c.sort_order,
    }));
    setForm({
      subject_id: q.subject_id,
      question_number: String(getNextQuestionNumber(q.subject_id)),
      question_text: q.question_text,
      question_type: q.question_type as QuestionForm["question_type"],
      explanation: q.explanation ?? "",
      explanation_en: q.explanation_en ?? "",
      explanation_vi: q.explanation_vi ?? "",
      exam_date: q.exam_date ?? "",
      difficulty: q.difficulty ?? 3,
      points: q.points ?? 1,
      image_url: q.image_url ?? "",
      choices,
    });
    setEditingId("new");
    setError("");
  }

  async function toggleExpanded(q: Question) {
    if (expandedId === q.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(q.id);
    try {
      await loadChoices(q.id);
    } catch (choiceError) {
      setExpandedId(null);
      setError(
        choiceError instanceof Error
          ? choiceError.message
          : translate(language, "adminPage.failedToSave"),
      );
    }
  }

  async function handleSave() {
    setError("");
    if (!form.question_text.trim()) {
      setError(translate(language, "adminPage.pleaseEnterTheQuestionText"));
      return;
    }
    if (!form.subject_id) {
      setError(translate(language, "adminPage.pleaseSelectASubject"));
      return;
    }
    const correctCount = form.choices.filter((c) => c.is_correct).length;
    if (correctCount === 0) {
      setError(translate(language, "adminPage.selectAtLeastOneCorrectChoice"));
      return;
    }
    const filledChoices = form.choices.filter((c) => c.choice_text.trim());
    if (filledChoices.length < 2) {
      setError(translate(language, "adminPage.enterAtLeastTwoChoices"));
      return;
    }

    setSaving(true);
    try {
      const qPayload = {
        subject_id: form.subject_id,
        question_number: parseInt(form.question_number) || 0,
        question_text: form.question_text.trim(),
        question_type: form.question_type,
        explanation: form.explanation.trim() || null,
        explanation_ja: form.explanation.trim() || null,
        explanation_en: form.explanation_en.trim() || null,
        explanation_vi: form.explanation_vi.trim() || null,
        exam_date: form.exam_date || null,
        difficulty: form.difficulty,
        points: form.points,
        image_url: form.image_url.trim() || null,
      };

      let questionId = editingId !== "new" ? editingId! : "";

      if (editingId === "new") {
        const { data, error: err } = await supabase
          .from("questions")
          .insert(qPayload)
          .select()
          .single();
        if (err) throw err;
        questionId = data.id;
      } else {
        const { error: err } = await supabase
          .from("questions")
          .update(qPayload)
          .eq("id", questionId);
        if (err) throw err;
        const { error: deleteChoiceError } = await supabase
          .from("answer_choices")
          .delete()
          .eq("question_id", questionId);
        if (deleteChoiceError) throw deleteChoiceError;
      }

      const choicePayloads = filledChoices.map((c, i) => ({
        question_id: questionId,
        choice_text: c.choice_text.trim(),
        is_correct: c.is_correct,
        sort_order: i + 1,
      }));
      const { error: choiceErr } = await supabase
        .from("answer_choices")
        .insert(choicePayloads);
      if (choiceErr) throw choiceErr;

      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : translate(language, "adminPage.failedToSave"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(translate(language, "adminPage.deleteThisQuestion"))) return;
    setError("");
    try {
      const { error: choiceError } = await supabase
        .from("answer_choices")
        .delete()
        .eq("question_id", id);
      if (choiceError) throw choiceError;
      const { error: questionError } = await supabase
        .from("questions")
        .delete()
        .eq("id", id);
      if (questionError) throw questionError;
      await load();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : translate(language, "adminPage.failedToSave"),
      );
    }
  }

  async function handleCsvFileChange(
    type: "questions" | "choices",
    file: File | undefined,
  ) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError(translate(language, "adminPage.csvInvalidExtension"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(translate(language, "adminPage.csvFileTooLarge"));
      return;
    }
    setError("");
    setCsvFileNames((current) => ({ ...current, [type]: file.name }));
    try {
      const rows = await readCsvFile(file);
      setImportData((current) => ({
        questions: type === "questions" ? rows : (current?.questions ?? []),
        choices: type === "choices" ? rows : (current?.choices ?? []),
      }));
    } catch (e: unknown) {
      setCsvFileNames((current) => ({ ...current, [type]: "" }));
      setError(
        e instanceof Error
          ? e.message
          : translate(language, "adminPage.csvReadFailed"),
      );
    }
  }

  function resetCsvImport() {
    setShowCsvImportModal(false);
    setImportData(null);
    setCsvSubjectId("");
    setCsvFileNames({ questions: "", choices: "" });
    setError("");
    if (questionCsvInput.current) questionCsvInput.current.value = "";
    if (choiceCsvInput.current) choiceCsvInput.current.value = "";
  }

  function validateCsvImport(data: CsvImportData) {
    const requiredQuestionColumns = ["id", "question_number", "question_text"];
    const requiredChoiceColumns = [
      "id",
      "question_id",
      "choice_text",
      "is_correct",
      "sort_order",
    ];
    for (const column of requiredQuestionColumns) {
      if (!(column in (data.questions[0] ?? {})))
        throw new Error(`questions.csv is missing the "${column}" column.`);
    }
    for (const column of requiredChoiceColumns) {
      if (!(column in (data.choices[0] ?? {})))
        throw new Error(
          `answer_choices.csv is missing the "${column}" column.`,
        );
    }
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    const questionIds = new Set<string>();
    for (const question of data.questions) {
      if (!question.id || questionIds.has(question.id))
        throw new Error(
          "questions.csv contains a missing or duplicate question id.",
        );
      if (!question.question_text)
        throw new Error(`Question ${question.id} has no question_text.`);
      if (!Number.isInteger(Number(question.question_number)))
        throw new Error(
          `Question ${question.id} has an invalid question_number.`,
        );
      const resolvedSubjectId = resolveImportedSubjectId(
        question.subject_id || csvSubjectId,
        Number(question.question_number),
        subjectIds,
      );
      if (!resolvedSubjectId) {
        if (question.subject_id?.trim()) {
          throw new Error(
            `Unknown subject_id in questions.csv: ${question.subject_id}`,
          );
        }
        throw new Error(
          `Unable to detect a subject for question ${question.id}. Add a valid subject_id.`,
        );
      }
      questionIds.add(question.id);
    }

    const duplicateQuestions = findDuplicateQuestionKeys(
      data.questions.map((question) => ({
        key: `#${question.question_number || question.id}`,
        questionText: question.question_text,
        sourceKey: question.source_key,
      })),
      questions.map((question) => ({
        questionText: question.question_text,
        sourceKey: question.source_key,
      })),
    );
    if (duplicateQuestions.length) {
      throw new Error(
        translate(language, "adminPage.duplicateQuestionsFound", {
          questions: duplicateQuestions.slice(0, 10).join(", "),
        }),
      );
    }

    const choicesByQuestion = new Map<string, Record<string, string>[]>();
    const choiceIds = new Set<string>();
    for (const choice of data.choices) {
      if (!choice.id || choiceIds.has(choice.id))
        throw new Error(
          "answer_choices.csv contains a missing or duplicate choice id.",
        );
      if (!questionIds.has(choice.question_id))
        throw new Error(
          `Choice ${choice.id} refers to a question not included in questions.csv.`,
        );
      if (!choice.choice_text)
        throw new Error(`Choice ${choice.id} has no choice_text.`);
      if (!["true", "false"].includes(choice.is_correct.toLowerCase()))
        throw new Error(
          `Choice ${choice.id} must use true or false for is_correct.`,
        );
      if (!Number.isInteger(Number(choice.sort_order)))
        throw new Error(`Choice ${choice.id} has an invalid sort_order.`);
      choiceIds.add(choice.id);
      const choices = choicesByQuestion.get(choice.question_id) ?? [];
      choices.push(choice);
      choicesByQuestion.set(choice.question_id, choices);
    }
    for (const question of data.questions) {
      const questionChoices = choicesByQuestion.get(question.id) ?? [];
      if (
        questionChoices.length < 2 ||
        questionChoices.filter(
          (choice) => choice.is_correct.toLowerCase() === "true",
        ).length !== 1
      ) {
        throw new Error(
          `Question ${question.id} must have at least two choices and exactly one correct answer.`,
        );
      }
    }
  }

  async function importCsv() {
    if (!importData) return;
    setError("");
    try {
      validateCsvImport(importData);
      setImporting(true);
      const subjectIds = subjects.map((subject) => subject.id);
      const questionPayloads = importData.questions.map((question) => ({
        id: question.id,
        subject_id: resolveImportedSubjectId(
          question.subject_id || csvSubjectId,
          Number(question.question_number),
          subjectIds,
        )!,
        question_number: Number(question.question_number),
        question_text: question.question_text,
        question_type: question.question_type || "multiple_choice",
        image_url: question.image_url || null,
        explanation: question.explanation || null,
        explanation_ja: question.explanation_ja || question.explanation || null,
        explanation_en: question.explanation_en || null,
        explanation_vi: question.explanation_vi || null,
        difficulty: Number(question.difficulty) || 2,
        points: parseQuestionPoints(question.points),
        exam_date: question.exam_date || null,
        source_key: question.source_key || null,
      }));
      const { error: questionError } = await supabase
        .from("questions")
        .insert(questionPayloads);
      if (questionError) throw questionError;

      const choicePayloads = importData.choices.map((choice) => ({
        id: choice.id,
        question_id: choice.question_id,
        choice_text: choice.choice_text,
        image_url: choice.image_url || null,
        is_correct: choice.is_correct.toLowerCase() === "true",
        sort_order: Number(choice.sort_order),
      }));
      const { error: choiceError } = await supabase
        .from("answer_choices")
        .insert(choicePayloads);
      if (choiceError) {
        const { error: rollbackError } = await supabase
          .from("questions")
          .delete()
          .in(
            "id",
            questionPayloads.map((question) => question.id),
          );
        if (rollbackError) throw rollbackError;
        throw choiceError;
      }
      setImportData(null);
      setShowCsvImportModal(false);
      setCsvSubjectId("");
      setCsvFileNames({ questions: "", choices: "" });
      if (questionCsvInput.current) questionCsvInput.current.value = "";
      if (choiceCsvInput.current) choiceCsvInput.current.value = "";
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /already exists|duplicate/i.test(message)
          ? translate(language, "adminPage.duplicateQuestionExists")
          : message || translate(language, "adminPage.csvImportFailed"),
      );
    } finally {
      setImporting(false);
    }
  }

  function setChoice(idx: number, patch: Partial<ChoiceForm>) {
    setForm((f) => ({
      ...f,
      choices: f.choices.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function addChoice() {
    setForm((f) => ({
      ...f,
      choices: [
        ...f.choices,
        {
          choice_text: "",
          is_correct: false,
          sort_order: f.choices.length + 1,
        },
      ],
    }));
  }

  function removeChoice(idx: number) {
    setForm((f) => ({ ...f, choices: f.choices.filter((_, i) => i !== idx) }));
  }

  if (editingId !== null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">
            {editingId === "new"
              ? translate(language, "adminPage.addQuestion")
              : translate(language, "adminPage.editQuestion")}
          </h2>
          <button
            onClick={() => setEditingId(null)}
            className="p-2 hover:bg-gray-100 rounded-xl transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.subject")}
            </label>
            <select
              value={form.subject_id}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  subject_id: e.target.value,
                  question_number:
                    editingId === "new"
                      ? String(getNextQuestionNumber(e.target.value))
                      : f.question_number,
                }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.questionNumber")}
            </label>
            <input
              type="number"
              value={form.question_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, question_number: e.target.value }))
              }
              placeholder={translate(language, "adminPage.eG1")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.questionType")}
            </label>
            <select
              value={form.question_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  question_type: e.target
                    .value as QuestionForm["question_type"],
                }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="multiple_choice">
                {translate(language, "adminPage.multipleChoice")}
              </option>
              <option value="true_false">
                {translate(language, "adminPage.trueFalse")}
              </option>
              <option value="tree">
                {translate(language, "adminPage.tree")}
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.examDate")}
            </label>
            <input
              type="date"
              value={form.exam_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, exam_date: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.difficulty")} ({form.difficulty})
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={form.difficulty}
              onChange={(e) =>
                setForm((f) => ({ ...f, difficulty: parseInt(e.target.value) }))
              }
              className="w-full mt-2"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.points")}
            </label>
            <input
              type="number"
              min={1}
              value={form.points}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  points: parseQuestionPoints(e.target.value, f.points),
                }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.imageUrlOptional")}
            </label>
            <input
              type="url"
              value={form.image_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, image_url: e.target.value }))
              }
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {translate(language, "adminPage.questionText")}
          </label>
          <textarea
            value={form.question_text}
            onChange={(e) =>
              setForm((f) => ({ ...f, question_text: e.target.value }))
            }
            rows={4}
            placeholder={translate(language, "adminPage.enterTheQuestionText")}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {translate(language, "adminPage.explanationJapanese")}
          </label>
          <textarea
            value={form.explanation}
            onChange={(e) =>
              setForm((f) => ({ ...f, explanation: e.target.value }))
            }
            rows={3}
            placeholder={translate(language, "adminPage.enterAnExplanation")}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.explanationEnglish")}
            </label>
            <textarea
              value={form.explanation_en}
              onChange={(e) =>
                setForm((f) => ({ ...f, explanation_en: e.target.value }))
              }
              rows={3}
              placeholder={translate(
                language,
                "adminPage.englishExplanationPlaceholder",
              )}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, "adminPage.explanationVietnamese")}
            </label>
            <textarea
              value={form.explanation_vi}
              onChange={(e) =>
                setForm((f) => ({ ...f, explanation_vi: e.target.value }))
              }
              rows={3}
              placeholder={translate(
                language,
                "adminPage.vietnameseExplanationPlaceholder",
              )}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        </div>

        <p className="mb-4 text-xs text-gray-400">
          {translate(
            language,
            "adminPage.questionsAndChoicesStayInJapaneseOnlyExplanations",
          )}
        </p>

        {/* Choices */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500">
              {translate(language, "adminPage.choices")}
            </label>
            <button
              onClick={addChoice}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />{" "}
              {translate(language, "adminPage.add")}
            </button>
          </div>
          <div className="space-y-2">
            {form.choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (c.is_correct) {
                      setChoice(i, { is_correct: false });
                    } else {
                      setForm((f) => ({
                        ...f,
                        choices: f.choices.map((ch, idx) => ({
                          ...ch,
                          is_correct: idx === i,
                        })),
                      }));
                    }
                  }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                    c.is_correct
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-gray-300 hover:border-emerald-400"
                  }`}
                >
                  {c.is_correct && (
                    <CheckCircle className="w-4 h-4 text-white" />
                  )}
                </button>
                <input
                  type="text"
                  value={c.choice_text}
                  onChange={(e) =>
                    setChoice(i, { choice_text: e.target.value })
                  }
                  placeholder={translate(
                    language,
                    "adminPage.choicePlaceholder",
                    { number: i + 1 },
                  )}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {form.choices.length > 2 && (
                  <button
                    onClick={() => removeChoice(i)}
                    className="p-1 text-gray-400 hover:text-red-500 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {translate(
              language,
              "adminPage.clickTheRoundButtonToSelectTheCorrect",
            )}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setEditingId(null)}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition"
          >
            {translate(language, "adminPage.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {translate(language, "adminPage.save")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setListPage(1);
            }}
            placeholder={translate(language, "adminPage.searchQuestions")}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <select
          value={filterSubject}
          onChange={(e) => {
            setFilterSubject(e.target.value);
            setListPage(1);
          }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">
            {translate(language, "adminPage.allSubjects")}
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-500"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <input
          ref={questionCsvInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) =>
            handleCsvFileChange("questions", e.target.files?.[0])
          }
        />
        <input
          ref={choiceCsvInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleCsvFileChange("choices", e.target.files?.[0])}
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowQuestionInputMenu((current) => !current)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            {translate(language, "adminPage.addQuestion")}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                showQuestionInputMenu ? "rotate-180" : ""
              }`}
            />
          </button>

          {showQuestionInputMenu && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setShowQuestionInputMenu(false);
                  startNew();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">
                    {translate(language, "adminPage.addQuestion")}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {translate(language, "adminPage.csvManualDescription")}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuestionInputMenu(false);
                  setShowCsvImportModal(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">
                    {translate(language, "adminPage.importCsv")}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {translate(language, "adminPage.csvImportDescription")}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuestionInputMenu(false);
                  setShowPdfImporter((current) => !current);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-violet-700 transition hover:bg-violet-50"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">
                    {translate(language, "adminPage.pdfImport")}
                  </span>
                  <span className="block text-xs text-violet-400">
                    Import questions from PDF
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showCsvImportModal && (
        <div className="w-full mb-4">
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                  <Upload className="h-4 w-4 text-blue-600" />
                </div>

                <div>
                  <h2 className="text-sm font-bold text-gray-800">
                    {translate(language, "adminPage.csvModalTitle")}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {translate(language, "adminPage.csvModalDescription")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetCsvImport}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {/* Chọn môn */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold text-gray-600">
                  1. {translate(language, "adminPage.csvChooseSubject")}
                </label>

                <select
                  value={csvSubjectId}
                  onChange={(event) => setCsvSubjectId(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">
                    {translate(language, "adminPage.csvAutoDetectSubject")}
                  </option>

                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>

                <p className="mt-1.5 text-[11px] text-gray-400">
                  {translate(language, "adminPage.csvSubjectHelp")}
                </p>
              </div>

              {/* File */}
              <div>
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-600">
                    2. {translate(language, "adminPage.csvDataFiles")}
                  </label>

                  <p className="mt-1 text-[11px] text-gray-400">
                    {translate(language, "adminPage.csvDataFilesHelp")}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* ================= FILE CÂU HỎI ================= */}
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();

                      void handleCsvFileChange(
                        "questions",
                        event.dataTransfer.files[0],
                      );
                    }}
                    className={`rounded-xl border border-dashed p-4 transition ${
                      csvFileNames.questions
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-blue-200 bg-blue-50/20 hover:border-blue-400 hover:bg-blue-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          csvFileNames.questions
                            ? "bg-emerald-100"
                            : "bg-blue-100"
                        }`}
                      >
                        {csvFileNames.questions ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Upload className="h-4 w-4 text-blue-600" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {translate(language, "adminPage.csvQuestionFile")}
                        </p>

                        <p className="mt-0.5 text-[11px] text-gray-400">
                          questions.csv
                        </p>
                      </div>
                    </div>

                    {!csvFileNames.questions ? (
                      <div className="mt-4">
                        <p className="mb-2 text-center text-[11px] text-gray-400">
                          {translate(language, "adminPage.csvDropFile")}
                        </p>

                        <button
                          type="button"
                          onClick={() => questionCsvInput.current?.click()}
                          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                        >
                          {translate(language, "adminPage.csvChooseFile")}
                        </button>

                        <p className="mt-2 text-center text-[10px] text-gray-400">
                          {translate(language, "adminPage.csvFileLimit")}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-100 bg-white px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />

                          <span className="truncate text-xs font-medium text-gray-700">
                            {csvFileNames.questions}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCsvFileNames((current) => ({
                              ...current,
                              questions: "",
                            }));

                            setImportData((current) =>
                              current
                                ? {
                                    ...current,
                                    questions: [],
                                  }
                                : current,
                            );

                            if (questionCsvInput.current) {
                              questionCsvInput.current.value = "";
                            }
                          }}
                          className="ml-2 shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          aria-label={translate(
                            language,
                            "adminPage.csvRemoveQuestionFile",
                          )}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ================= FILE ĐÁP ÁN ================= */}
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();

                      void handleCsvFileChange(
                        "choices",
                        event.dataTransfer.files[0],
                      );
                    }}
                    className={`rounded-xl border border-dashed p-4 transition ${
                      csvFileNames.choices
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-violet-200 bg-violet-50/20 hover:border-violet-400 hover:bg-violet-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          csvFileNames.choices
                            ? "bg-emerald-100"
                            : "bg-violet-100"
                        }`}
                      >
                        {csvFileNames.choices ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Upload className="h-4 w-4 text-violet-600" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {translate(language, "adminPage.csvAnswerFile")}
                        </p>

                        <p className="mt-0.5 text-[11px] text-gray-400">
                          answer_choices.csv
                        </p>
                      </div>
                    </div>

                    {!csvFileNames.choices ? (
                      <div className="mt-4">
                        <p className="mb-2 text-center text-[11px] text-gray-400">
                          {translate(language, "adminPage.csvDropFile")}
                        </p>

                        <button
                          type="button"
                          onClick={() => choiceCsvInput.current?.click()}
                          className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                        >
                          {translate(language, "adminPage.csvChooseFile")}
                        </button>

                        <p className="mt-2 text-center text-[10px] text-gray-400">
                          {translate(language, "adminPage.csvFileLimit")}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-100 bg-white px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />

                          <span className="truncate text-xs font-medium text-gray-700">
                            {csvFileNames.choices}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCsvFileNames((current) => ({
                              ...current,
                              choices: "",
                            }));

                            setImportData((current) =>
                              current
                                ? {
                                    ...current,
                                    choices: [],
                                  }
                                : current,
                            );

                            if (choiceCsvInput.current) {
                              choiceCsvInput.current.value = "";
                            }
                          }}
                          className="ml-2 shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          aria-label={translate(
                            language,
                            "adminPage.csvRemoveAnswerFile",
                          )}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />

                  <div>
                    <p className="text-xs font-semibold text-red-700">
                      {translate(language, "adminPage.csvImportErrorTitle")}
                    </p>

                    <p className="mt-1 text-xs text-red-600">{error}</p>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    {translate(language, "adminPage.csvStatus")}
                  </p>

                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {translate(language, "adminPage.csvStatusHelp")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {importData?.questions.length ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      {translate(language, "adminPage.csvQuestionCount", {
                        count: importData.questions.length,
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] text-gray-500">
                      {translate(language, "adminPage.csvNoQuestions")}
                    </span>
                  )}

                  {importData?.choices.length ? (
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                      {translate(language, "adminPage.csvAnswerCount", {
                        count: importData.choices.length,
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] text-gray-500">
                      {translate(language, "adminPage.csvNoAnswers")}
                    </span>
                  )}
                </div>
              </div>

              {/* Note */}
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800">
                  {translate(language, "adminPage.csvNotes")}
                </p>

                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-amber-700">
                  <li>{translate(language, "adminPage.csvQuestionColumns")}</li>

                  <li>{translate(language, "adminPage.csvAnswerColumn")}</li>

                  <li>{translate(language, "adminPage.csvAnyCount")}</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs">
                {importData?.questions.length && importData?.choices.length ? (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {translate(language, "adminPage.csvReady")}
                  </span>
                ) : (
                  <span className="text-gray-400">
                    {translate(language, "adminPage.csvSelectBoth")}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetCsvImport}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                >
                  Hủy
                </button>

                <button
                  type="button"
                  onClick={importCsv}
                  disabled={
                    importing ||
                    !importData?.questions.length ||
                    !importData?.choices.length
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}

                  {importing
                    ? translate(language, "adminPage.csvImporting")
                    : translate(language, "adminPage.importCsv")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPdfImporter && (
        <PdfQuestionImporter
          subjects={subjects}
          onClose={() => setShowPdfImporter(false)}
          onImported={load}
        />
      )}

      {importData && !showCsvImportModal && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-blue-800">
              <p className="font-semibold">
                {translate(language, "adminPage.csvReadyToImport")}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {importData.questions.length}{" "}
                {translate(language, "adminPage.questions")} /{" "}
                {importData.choices.length}{" "}
                {translate(language, "adminPage.choices")}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {translate(language, "adminPage.csvImportFormat")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setImportData(null)}
                className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg"
              >
                {translate(language, "adminPage.cancel")}
              </button>
              <button
                onClick={importCsv}
                disabled={
                  importing ||
                  !importData.questions.length ||
                  !importData.choices.length
                }
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60"
              >
                {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                {translate(language, "adminPage.importCsv")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {loading
              ? translate(language, "adminPage.loading")
              : `${filtered.length}${translate(language, "adminPage.items")}`}
          </span>
          {!loading && filtered.length > QUESTION_LIST_PAGE_SIZE && (
            <span className="text-xs font-medium text-gray-400">
              {translate(language, "adminPage.pageOf", {
                current: currentListPage,
                total: listPageCount,
              })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {translate(language, "adminPage.noQuestionsYetStartByAddingOne")}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visibleQuestions.map((q) => {
              const sub = subjectById.get(q.subject_id);
              const isExpanded = expandedId === q.id;
              const choices = choicesByQuestion[q.id] ?? [];
              const choicesLoading = loadingChoicesId === q.id;
              const explanation = getLocalizedExplanation(q, language);
              return (
                <div key={q.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-gray-400 w-8 shrink-0 mt-0.5">
                      #{q.question_number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sub && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${sub.color}20`,
                              color: sub.color,
                            }}
                          >
                            {sub.name}
                          </span>
                        )}
                        {q.exam_date && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {q.exam_date}
                          </span>
                        )}
                        <DiffBadge d={q.difficulty ?? 3} />
                      </div>
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2">
                        {q.question_text}
                      </p>
                      {isExpanded && (
                        <div className="mt-3 space-y-1.5">
                          {choicesLoading && (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              {translate(language, "adminPage.loading")}
                            </div>
                          )}
                          {choices.map((c) => (
                            <div
                              key={c.id}
                              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${c.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-600"}`}
                            >
                              {c.is_correct ? (
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />
                              )}
                              {c.choice_text}
                            </div>
                          ))}
                          {explanation && (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                              <strong>
                                {translate(language, "adminPage.explanation")}
                              </strong>{" "}
                              {explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => void toggleExpanded(q)}
                        disabled={choicesLoading}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => void startEdit(q)}
                        disabled={choicesLoading}
                        title={translate(language, "adminPage.editQuestion")}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        {choicesLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Edit2 className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => void startDuplicate(q)}
                        disabled={choicesLoading}
                        title={translate(
                          language,
                          "adminPage.duplicateQuestion",
                        )}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        title={translate(language, "adminPage.deleteQuestion")}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && filtered.length > QUESTION_LIST_PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setListPage((page) => Math.max(1, page - 1))}
              disabled={currentListPage === 1}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {translate(language, "adminPage.previousPage")}
            </button>
            <span className="text-xs font-medium text-gray-400">
              {translate(language, "adminPage.pageOf", {
                current: currentListPage,
                total: listPageCount,
              })}
            </span>
            <button
              type="button"
              onClick={() =>
                setListPage((page) => Math.min(listPageCount, page + 1))
              }
              disabled={currentListPage === listPageCount}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {translate(language, "adminPage.nextPage")}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
