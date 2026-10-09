import { translateMessage, translate, type Language } from "../i18n";
import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  PieChart,
  CheckCircle2,
  Check,
  LayoutGrid,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Play,
  TrendingUp,
  Flag,
  type LucideIcon,
} from "lucide-react";
import Layout from "../components/Layout";
import {
  fetchPracticeQuestions,
  loadExamDates,
  loadLatestAnswerStatus,
  loadPracticeProgress,
  practiceErrorMessage,
  type ExamDateFilter,
  type ModeFilter,
} from "../lib/practice";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Question, Page } from "../types";
import { formatExamPeriodKey, UNCATEGORIZED_EXAM_DATE } from "../lib/examDate";
import { orderPracticeQuestions } from "../lib/questionRandomization";

import { IT_PASSPORT_SUBJECT_IDS } from '../lib/questionSubject';
import { loadFlaggedQuestions, loadQuestionFlags, QUESTION_FLAG_LEVELS, type QuestionFlagLevel } from '../lib/questionFlags';

interface PracticeListPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onStartPractice: (
    subjectId: string,
    questions: Question[],
  ) => void | Promise<void>;
}

type LanguageCode = Language;

/* ---------- Shared style tokens (same look as the home page) ---------- */
const CARD =
  "rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.055)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:[backdrop-filter:blur(16px)] dark:[-webkit-backdrop-filter:blur(16px)]";
const BTN_PRIMARY =
  "bg-indigo-500 text-white hover:bg-indigo-600 dark:bg-[#7EA2F8] dark:text-slate-950 dark:hover:bg-blue-300";
const FIELD =
  "rounded-full border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[#F8FAFC]";
const PANEL =
  "rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900";

const MAIN_CATEGORIES = [
  {
    id: "strategy",
    labelKey: "practiceListPage.strategy" as const,
    icon: PieChart,
    color: "#3B82F6",
    borderColor: "border-blue-400",
    bgColor: "bg-blue-50",
    iconColor: "text-blue-500",
    labelColor: "text-blue-600",
    dotColor: "bg-blue-500",
    borderless: true,
    cardClass: "bg-[#A9C0EA]",
    shapeClass:
      "bg-[#7F9FD6] [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]",
    subjectIds: [IT_PASSPORT_SUBJECT_IDS.strategy],
  },
  {
    id: "management",
    labelKey: "practiceListPage.management" as const,
    icon: CheckCircle2,
    color: "#10B981",
    borderColor: "border-emerald-400",
    bgColor: "bg-emerald-50",
    iconColor: "text-emerald-500",
    labelColor: "text-emerald-600",
    dotColor: "bg-emerald-500",
    borderless: true,
    cardClass: "bg-[#B9C27E]",
    shapeClass: "bg-[#8F9B4A] [clip-path:polygon(0_0,100%_0,50%_100%)]",
    subjectIds: [IT_PASSPORT_SUBJECT_IDS.management],
  },
  {
    id: "technology",
    labelKey: "practiceListPage.technology" as const,
    icon: LayoutGrid,
    color: "#F59E0B",
    borderColor: "border-amber-400",
    bgColor: "bg-amber-50",
    iconColor: "text-amber-500",
    labelColor: "text-amber-600",
    dotColor: "bg-amber-500",
    borderless: true,
    cardClass: "bg-[#F9E27D]",
    shapeClass:
      "bg-[#F2C94C] [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]",

    subjectIds: [IT_PASSPORT_SUBJECT_IDS.technology],

  },
];

const KNOWN_ADDITIONAL_SUBJECTS = [
  {
    id: "aa000000-0000-0000-0000-000000000001",
    name: "基本情報技術者 科目A",
    color: "#3B82F6",
  },
];

type MainCategoryLabelKey = (typeof MAIN_CATEGORIES)[number]["labelKey"];

interface PracticeCategory {
  id: string;
  labelKey?: MainCategoryLabelKey;
  name?: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  labelColor: string;
  borderless?: boolean;
  dotColor: string;
  cardClass: string;
  shapeClass: string;
  subjectIds: string[];
}

interface CategoryStats {
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  progress: number;
  accuracy: number;
}

function getCategoryLabel(category: PracticeCategory, language: LanguageCode) {
  return category.name ?? translate(language, category.labelKey!);
}

function CategoryCard({
  category,
  stats,
  onStart,
  loading,
  language,
}: {
  category: PracticeCategory;
  stats: CategoryStats;
  onStart: () => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const Icon = category.icon;
  const categoryLabel = getCategoryLabel(category, language);

  return (
    <button type="button"
      onClick={onStart}
      disabled={loading || stats.questionCount === 0}
      className={`${category.cardClass} group relative flex min-h-[150px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-3xl p-5 text-left text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        aria-hidden="true"
        className={`${category.shapeClass} pointer-events-none absolute -right-4 -top-4 h-24 w-24 opacity-70 transition group-hover:scale-110`}
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 truncate text-lg font-bold">
          {categoryLabel}
        </span>
      </div>

      <div className="relative mt-4">
        <p className="text-xs text-slate-800/70">
          {translate(language, "practiceListPage.progress")}{" "}
          <span className="font-semibold text-slate-900">
            {stats.progress}%
          </span>{" "}
          ／ {translate(language, "practiceListPage.questions")}{" "}
          <span className="font-semibold text-slate-900">
            {stats.questionCount}
            {translate(language, "practiceListPage.questionCountSuffix")}
          </span>
        </p>

        {stats.questionCount > 0 && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/50">
            <div
              className="h-full rounded-full bg-slate-900/70 transition-all"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        )}

        {loading && (
          <p className="mt-1 text-xs text-slate-800/60">
            {translate(language, "practiceListPage.loading")}
          </p>
        )}
      </div>
    </button>
  );
}

function ReviewCard({
  count,
  onStart,
  language,
}: {
  count: number;
  onStart: () => void;
  language: LanguageCode;
}) {
  return (
    <button type="button"
      onClick={onStart}
      disabled={count === 0}
      className="group relative flex min-h-[150px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-3xl bg-[#F4B0D0] p-5 text-left text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#E88BB8] opacity-70 transition group-hover:scale-110"
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60">
          <RefreshCw className="h-5 w-5" />
        </span>
        <span className="min-w-0 truncate text-lg font-bold">
          {translate(language, "practiceListPage.reviewMistakes")}
        </span>
      </div>

      <p className="relative mt-4 text-xs text-slate-800/70">
        {translate(language, "practiceListPage.notReviewed")}{" "}
        <span className="font-semibold text-slate-900">
          {count}
          {translate(language, "practiceListPage.questionCountSuffix")}
        </span>
      </p>
    </button>
  );
}

export function FlaggedQuestionsCard({
  counts,
  onStart,
  loading,
  language,
}: {
  counts: Record<QuestionFlagLevel, number>;
  onStart: (level?: QuestionFlagLevel) => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const styles = {
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    orange:
      "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    red:
      "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  } as const;

  useEffect(() => {
    if (!expanded) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  return (
    <div
      ref={cardRef}
      className={`group relative flex min-h-[150px] w-full min-w-0 flex-col justify-between rounded-3xl bg-[#F5D9C4] p-5 text-left text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-lg ${expanded ? "z-20" : ""}`}
    >
      {/* Decorative shape (clipped to the card) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
      >
        <span className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#EBBF9F] opacity-70 transition group-hover:scale-110" />
      </div>

      {/* Full-card clickable button */}
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        disabled={loading}
        aria-expanded={expanded}
        aria-controls="flagged-question-actions"
        aria-label={translate(
          language,
          "practiceListPage.flaggedQuestions",
        )}
        className="
          absolute
          inset-0
          z-0
          rounded-3xl
          bg-transparent
          hover:bg-transparent
          focus:bg-transparent
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-indigo-500
          focus-visible:ring-offset-2
          disabled:cursor-not-allowed
        "
      />

      {/* Visible card content */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60">
            <Flag className="h-5 w-5 fill-current" />
          </span>

          <span className="min-w-0 flex-1 truncate text-lg font-bold">
            {translate(
              language,
              "practiceListPage.flaggedQuestions",
            )}
          </span>

          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        <span className="block text-xs text-slate-800/70">
          {translate(
            language,
            "practiceListPage.flaggedCount",
            { count: total },
          )}
        </span>
      </div>

      {expanded && (
        <div
          id="flagged-question-actions"
          className={`absolute left-0 top-full z-30 mt-2 w-full space-y-2 p-3 ${PANEL}`}
        >
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              onStart();
            }}
            disabled={loading || total === 0}
            className="
              flex
              w-full
              items-center
              justify-center
              gap-2
              rounded-full
              bg-slate-900
              px-3
              py-2
              text-sm
              font-semibold
              text-white
              transition-colors
              hover:bg-slate-700
              disabled:cursor-not-allowed
              disabled:opacity-50
              dark:bg-slate-600
              dark:hover:bg-slate-500
            "
          >
            <Play className="h-3.5 w-3.5" />

            {translate(
              language,
              "practiceListPage.practiceAllFlags",
            )}{" "}
            ({total})
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            {QUESTION_FLAG_LEVELS.map((level) => {
              const label = translate(
                language,
                `practiceQuestionPage.flag${
                  level[0].toUpperCase() + level.slice(1)
                }` as
                  | "practiceQuestionPage.flagGreen"
                  | "practiceQuestionPage.flagOrange"
                  | "practiceQuestionPage.flagRed",
              );

              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    onStart(level);
                  }}
                  disabled={loading || counts[level] === 0}
                  aria-label={`${label}: ${counts[level]}`}
                  className={`
                    min-w-0
                    rounded-2xl
                    border
                    px-1.5
                    py-2
                    text-xs
                    font-semibold
                    transition-colors
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                    ${styles[level]}
                  `}
                >
                  <span className="block truncate">
                    {label}
                  </span>

                  <span className="block text-base font-bold">
                    {counts[level]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 py-2 pl-4 pr-3 sm:w-36 ${FIELD}`}
      >
        <span className="min-w-0 flex-1 truncate text-left sm:max-w-48">
          {label}: {selectedLabel}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto p-1.5 sm:right-auto sm:min-w-64 ${PANEL}`}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-indigo-50 dark:text-[#F8FAFC] dark:hover:bg-white/10"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-300 dark:border-slate-500"}`}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MultiSelectDropdown({
  label,
  allLabel,
  selectedValues,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  selectedValues: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0 ? allLabel : selectedLabels.join(", ");

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function toggleValue(value: string) {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((selected) => selected !== value)
        : [...selectedValues, value],
    );
  }

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 py-2 pl-4 pr-3 sm:w-36 ${FIELD}`}
      >
        <span className="min-w-0 flex-1 truncate text-left sm:max-w-48">
          {label}: {summary}
        </span>
        {selectedLabels.length > 1 && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-[rgba(126,162,248,0.20)] dark:text-[#7EA2F8]">
            {selectedLabels.length}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className={`absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto p-1.5 sm:right-auto sm:min-w-64 ${PANEL}`}
        >
          <button
            type="button"
            role="option"
            aria-selected={selectedValues.length === 0}
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-indigo-50 dark:text-[#F8FAFC] dark:hover:bg-white/10"
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedValues.length === 0 ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-300 dark:border-slate-500"}`}
            >
              {selectedValues.length === 0 && <Check className="h-3 w-3" />}
            </span>
            {allLabel}
          </button>
          {options.map((option) => {
            const selected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggleValue(option.value)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-indigo-50 dark:text-[#F8FAFC] dark:hover:bg-white/10"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-300 dark:border-slate-500"}`}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PracticeListPage({
  currentPage,
  onNavigate,
  onStartPractice,
}: PracticeListPageProps) {
  const { user } = useAuth();
  const { language } = useLanguage();

  const currentLanguage = language as LanguageCode;

  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>(
    {},
  );
  const [additionalCategories, setAdditionalCategories] = useState<
    PracticeCategory[]
  >([]);
  const [sessionStats, setSessionStats] = useState<
    Record<string, { answered: number; correct: number }>
  >({});
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [flagCounts, setFlagCounts] = useState<Record<QuestionFlagLevel, number>>({ green: 0, orange: 0, red: 0 });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progressWarning, setProgressWarning] = useState("");

  const [selectedExamDates, setSelectedExamDates] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [examDates, setExamDates] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [filterResult, setFilterResult] = useState<{
    key: string;
    questions: Question[];
    error: string;
  } | null>(null);
  const examDateFilter: ExamDateFilter =
    selectedExamDates.length > 0 ? selectedExamDates : "all";
  const filterKey = JSON.stringify([
    user?.id,
    selectedExamDates,
    selectedSubjectIds,
    modeFilter,
  ]);
  const currentResult = filterResult?.key === filterKey ? filterResult : null;
  const matchingQuestions = currentResult?.questions ?? [];
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        let questions = await fetchPracticeQuestions(
          selectedSubjectIds.length > 0 ? selectedSubjectIds : null,
          examDateFilter,
          "all",
        );
        if (modeFilter !== "all") {
          const latest = await loadLatestAnswerStatus(userId);
          questions = questions.filter((question) =>
            modeFilter === "new"
              ? !latest.has(question.id)
              : latest.get(question.id) === false,
          );
        }
        if (!cancelled)
          setFilterResult({ key: filterKey, questions, error: "" });
      } catch (error) {
        if (!cancelled)
          setFilterResult({
            key: filterKey,
            questions: [],
            error: practiceErrorMessage(
              error,
              "Unable to count matching questions.",
            ),
          });
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    userId,
    examDateFilter,
    selectedSubjectIds,
    modeFilter,
    filterKey,
  ]);

  async function startFilteredPractice() {
    if (
      !user ||
      starting ||
      !currentResult ||
      currentResult.error ||
      !matchingQuestions.length
    )
      return;
    setStarting("filtered");
    setError("");
    try {
      await onStartPractice(
        "all",
        orderPracticeQuestions(matchingQuestions, true),
      );
    } catch (error) {
      setError(practiceErrorMessage(error, "Unable to start practice."));
    } finally {
      setStarting(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionCounts() {
      setLoading(true);

      try {
        const { data: subjects, error: subjectError } = await supabase
          .from("subjects")
          .select("id, name, color")
          .order("name");

        if (subjectError) throw subjectError;

        const subjectMap = new Map(
          KNOWN_ADDITIONAL_SUBJECTS.map((subject) => [subject.id, subject]),
        );
        for (const subject of subjects ?? []) {
          subjectMap.set(subject.id, subject);
        }

        const subjectIds = [
          ...new Set([
            ...MAIN_CATEGORIES.flatMap((category) => category.subjectIds),
            ...subjectMap.keys(),
          ]),
        ];

        const [availableExamDates, allQuestions] = await Promise.all([
          loadExamDates(),
          fetchPracticeQuestions(null, "all", "all"),
        ]);

        const counts = Object.fromEntries(
          subjectIds.map((subjectId) => [subjectId, 0]),
        ) as Record<string, number>;
        for (const question of allQuestions) {
          counts[question.subject_id] = (counts[question.subject_id] ?? 0) + 1;
        }

        if (cancelled) return;

        setQuestionCounts(counts);
        setExamDates(availableExamDates);
        const mainSubjectIds = new Set<string>(
          MAIN_CATEGORIES.flatMap((category) => category.subjectIds),
        );
        setAdditionalCategories(
          [...subjectMap.values()]
            .filter(
              (subject) =>
                !mainSubjectIds.has(subject.id) &&
                (counts[subject.id] ?? 0) > 0,
            )
            .map((subject) => ({
              id: `subject-${subject.id}`,
              name: subject.name,
              icon: BookOpen,
              color: subject.color || "#8B5CF6",
              borderColor: "border-violet-400",
              bgColor: "bg-violet-50",
              iconColor: "text-violet-500",
              labelColor: "text-violet-600",
              dotColor: "bg-violet-500",
              cardClass: "bg-[#C9C4F5]",
              shapeClass: "bg-[#A9A2EB] rounded-full",
              subjectIds: [subject.id],
            })),
        );
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load practice subjects.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadUserStats() {
      setProgressWarning("");
      if (!user) {
        if (!cancelled) {
          setSessionStats({});
          setIncorrectCount(0);
        }
        return;
      }

      try {
        const sessions = await loadPracticeProgress(user.id);
        const stats: Record<string, { answered: number; correct: number }> = {};
        for (const session of sessions ?? []) {
          const subjectId = session.subject_id ?? "all";
          stats[subjectId] ??= { answered: 0, correct: 0 };
          stats[subjectId].answered += session.answered_count;
          stats[subjectId].correct += session.correct_answers ?? 0;
        }

        if (cancelled) return;

        setSessionStats(stats);
        // The same session list is reused to calculate the latest result per question.
        const latestAnswers = await loadLatestAnswerStatus(user.id, sessions);
        if (!cancelled)
          setIncorrectCount(
            [...latestAnswers.values()].filter((isCorrect) => !isCorrect)
              .length,
          );
      } catch (error) {
        if (!cancelled) {
          setIncorrectCount(0);
          setProgressWarning(
            practiceErrorMessage(error, "Unable to load practice progress."),
          );
        }
      }
    }

    async function loadFlagStats() {
      if (!user) {
        if (!cancelled) setFlagCounts({ green: 0, orange: 0, red: 0 });
        return;
      }
      try {
        const flags = await loadQuestionFlags(user.id);
        const counts: Record<QuestionFlagLevel, number> = { green: 0, orange: 0, red: 0 };
        for (const flag of flags) counts[flag.level] += 1;
        if (!cancelled) setFlagCounts(counts);
      } catch (error) {
        if (!cancelled) setProgressWarning(practiceErrorMessage(error, 'Unable to load flagged questions.'));
      }
    }

    void loadQuestionCounts();
    void loadUserStats();
    void loadFlagStats();

    return () => {
      cancelled = true;
    };
  }, [user]);

  function getCategoryStats(subjectIds: string[]): CategoryStats {
    const questionCount = subjectIds.reduce(
      (a, id) => a + (questionCounts[id] ?? 0),
      0,
    );

    let answered = 0;
    let correct = 0;

    for (const id of subjectIds) {
      answered += sessionStats[id]?.answered ?? 0;
      correct += sessionStats[id]?.correct ?? 0;
    }

    const progress =
      questionCount > 0
        ? Math.min(100, Math.round((answered / questionCount) * 100))
        : 0;

    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    return {
      questionCount,
      answeredCount: answered,
      correctCount: correct,
      progress,
      accuracy,
    };
  }

  async function startCategory(subjectIds: string[] | null, key: string) {
    if (!user || starting) return;
    setStarting(key);
    setError("");

    try {
      let selectedQuestions = await fetchPracticeQuestions(
        subjectIds,
        key === "all" ? "all" : examDateFilter,
        "all",
      );

      if (key !== "all" && modeFilter !== "all") {
        const latestAnswers = await loadLatestAnswerStatus(user!.id);
        selectedQuestions = selectedQuestions.filter((question) =>
          modeFilter === "new"
            ? !latestAnswers.has(question.id)
            : latestAnswers.get(question.id) === false,
        );
      }

      if (selectedQuestions.length > 0) {
        await onStartPractice(
          !subjectIds || subjectIds.length > 1 ? "all" : subjectIds[0],
          orderPracticeQuestions(selectedQuestions, false),
        );
      } else {
        setError(translate(currentLanguage, "ui.noMatches"));
      }
    } catch (error) {
      setError(practiceErrorMessage(error, "Unable to start practice."));
    } finally {
      setStarting(null);
    }
  }

  async function startReview() {
    if (!user || starting) return;
    setStarting("review");
    setError("");

    try {
      const latestAnswers = await loadLatestAnswerStatus(user!.id);
      const qIds = [...latestAnswers.entries()]
        .filter(([, isCorrect]) => !isCorrect)
        .map(([questionId]) => questionId)
        .slice(0, 20);

      if (qIds.length === 0) {
        setError("No mistakes are waiting for review.");
        return;
      }

      const { data, error: questionsError } = await supabase
        .from("questions")
        .select("*, answer_choices(*)")
        .in("id", qIds);

      if (questionsError) throw questionsError;

      if (data && data.length > 0) {
        await onStartPractice(
          "review",
          orderPracticeQuestions(data as Question[], false),
        );
      }
    } catch (reviewError) {
      setError(practiceErrorMessage(reviewError, "Unable to start review."));
    } finally {
      setStarting(null);
    }
  }

  async function startFlagged(level?: QuestionFlagLevel) {
    if (!user || starting) return;
    setStarting(`flagged-${level ?? 'all'}`);
    setError('');
    try {
      const flaggedQuestions = await loadFlaggedQuestions(user.id, level);
      if (!flaggedQuestions.length) {
        setError(translate(currentLanguage, 'practiceListPage.noFlaggedQuestions'));
        return;
      }
      await onStartPractice('flagged', orderPracticeQuestions(flaggedQuestions, false));
    } catch (flagError) {
      setError(practiceErrorMessage(flagError, translate(currentLanguage, 'practiceListPage.flaggedLoadFailed')));
    } finally {
      setStarting(null);
    }
  }

  const categories: PracticeCategory[] = [...MAIN_CATEGORIES, ...additionalCategories];

  const summaryRows = categories.map((cat) => {
    const stats = getCategoryStats(cat.subjectIds);
    return { ...cat, stats };
  });

  const rowHover =
    "transition-colors group-hover:bg-gray-50 dark:group-hover:bg-white/5";

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(currentLanguage, "practiceListPage.practice")}
      subtitle={translate(currentLanguage, "practiceListPage.studyMenu")}
    >
      <div className="app-shell space-y-5">
        {/* Intro banner */}
        <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-r from-[#E4E6FF] to-[#EFEDFF] p-5 sm:p-6 dark:border-[rgba(255,255,255,0.10)] dark:from-[rgba(126,162,248,0.16)] dark:to-[rgba(170,166,248,0.10)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-0 h-full w-1/3 rounded-l-full bg-white/40 dark:bg-white/5"
          />
          <p className="relative text-base font-semibold text-indigo-950 sm:text-lg dark:text-[#F8FAFC]">
            {translate(
              currentLanguage,
              "practiceListPage.chooseASubjectAndFiltersToBeginPractice",
            )}
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/30 dark:text-[#F87171]">
            {error}
          </div>
        )}
        {progressWarning && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-[#FFB84D]">
            {translate(language, "ui.progressWarning", {
              error: translateMessage(language, progressWarning),
            })}
          </div>
        )}

        <div className="motion-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              stats={getCategoryStats(cat.subjectIds)}
              onStart={() => startCategory(cat.subjectIds, cat.id)}
              loading={loading || !!starting}
              language={currentLanguage}
            />
          ))}

          <ReviewCard
            count={incorrectCount}
            onStart={startReview}
            language={currentLanguage}
          />
          <FlaggedQuestionsCard
            counts={flagCounts}
            onStart={level => void startFlagged(level)}
            loading={loading || !!starting}
            language={currentLanguage}
          />
        </div>

        {/* Filter panel: stacked + full-width on mobile, inline on sm+ */}
        <div className={`relative z-10 p-4 sm:p-5 ${CARD}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <span className="shrink-0 text-sm font-semibold text-gray-600 dark:text-[#CBD5E1]">
                {translate(currentLanguage, "practiceListPage.filterBy")}
              </span>

              <MultiSelectDropdown
                label={translate(currentLanguage, "practiceListPage.examDate")}
                allLabel={translate(currentLanguage, "practiceListPage.all")}
                selectedValues={selectedExamDates}
                onChange={(values) => {
                  setSelectedExamDates(values);
                  setError("");
                }}
                options={examDates.map((date) => ({
                  value: date,
                  label:
                    date === UNCATEGORIZED_EXAM_DATE
                      ? translate(currentLanguage, "ui.uncategorized")
                      : formatExamPeriodKey(date, currentLanguage),
                }))}
              />

              <MultiSelectDropdown
                label={translate(currentLanguage, "practiceListPage.subject")}
                allLabel={translate(currentLanguage, "practiceListPage.all")}
                selectedValues={selectedSubjectIds}
                onChange={(values) => {
                  setSelectedSubjectIds(values);
                  setError("");
                }}
                options={categories.map((category) => ({
                  value: category.subjectIds[0],
                  label: getCategoryLabel(category, currentLanguage),
                }))}
              />

              <SelectDropdown
                label={translate(
                  currentLanguage,
                  "practiceListPage.learningMode",
                )}
                value={modeFilter}
                onChange={(value) => {
                  setModeFilter(value as ModeFilter);
                  setError("");
                }}
                options={[
                  {
                    value: "all",
                    label: translate(currentLanguage, "practiceListPage.all"),
                  },
                  {
                    value: "new",
                    label: translate(currentLanguage, "practiceListPage.new"),
                  },
                  {
                    value: "review",
                    label: translate(
                      currentLanguage,
                      "practiceListPage.review",
                    ),
                  },
                ]}
              />
            </div>

            <button type="button"
              onClick={() => void startFilteredPractice()}
              disabled={
                !!starting ||
                !currentResult ||
                !!currentResult.error ||
                matchingQuestions.length === 0
              }
              className={`flex w-full shrink-0 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto ${BTN_PRIMARY}`}
            >
              <Play className="h-3.5 w-3.5 shrink-0" />
              {translate(
                currentLanguage,
                "practiceListPage.practiceFiltered",
              )}
              {currentResult &&
                !currentResult.error &&
                ` (${matchingQuestions.length.toLocaleString()})`}
            </button>
          </div>

          <span role="status" aria-live="polite" className="sr-only">
            {!currentResult
              ? translate(
                  currentLanguage,
                  "practiceListPage.countingMatches",
                )
              : currentResult.error
                ? translateMessage(language, currentResult.error)
                : translate(
                    currentLanguage,
                    "practiceListPage.matchingQuestions",
                    { count: matchingQuestions.length.toLocaleString() },
                  )}
          </span>
          {currentResult?.error && (
            <p role="alert" className="mt-3 text-center text-sm text-red-600 dark:text-[#F87171]">
              {translateMessage(language, currentResult.error)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className={`min-w-0 p-5 sm:p-6 ${CARD}`}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-[#F8FAFC]">
              <TrendingUp className="h-4 w-4 text-blue-500 dark:text-[#7EA2F8]" />
              {translate(currentLanguage, "practiceListPage.progressBySubject")}
            </h3>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"
                  />
                ))}
              </div>
            ) : (
              <div className="w-full min-w-0">
                {/* Legend */}
                <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] text-gray-500 dark:text-[#94A3B8]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 dark:bg-[#7EA2F8]" />
                    {translate(currentLanguage, "practiceListPage.progress2")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 dark:bg-[#4CC9B0]" />
                    {translate(currentLanguage, "practiceListPage.accuracy")}
                  </span>
                </div>

                <ul className="space-y-5">
                  {summaryRows.map((row) => {
                    const noAnswers = row.stats.answeredCount === 0;
                    const accBar =
                      row.stats.accuracy >= 70
                        ? "bg-emerald-500 dark:bg-[#4CC9B0]"
                        : row.stats.accuracy >= 50
                          ? "bg-amber-500 dark:bg-[#FFB84D]"
                          : "bg-red-500 dark:bg-[#F87171]";
                    const accText =
                      row.stats.accuracy >= 70
                        ? "text-emerald-600 dark:text-[#4CC9B0]"
                        : row.stats.accuracy >= 50
                          ? "text-amber-500 dark:text-[#FFB84D]"
                          : "text-red-500 dark:text-[#F87171]";
                    return (
                      <li key={row.id}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.dotColor}`}
                            />
                            <span
                              className="block min-w-0 truncate text-sm font-medium text-gray-700 dark:text-[#F8FAFC]"
                              title={getCategoryLabel(row, currentLanguage)}
                            >
                              {getCategoryLabel(row, currentLanguage)}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs text-gray-400 dark:text-[#94A3B8]">
                            {row.stats.questionCount}
                            {translate(
                              currentLanguage,
                              "practiceListPage.questionCountSuffix",
                            )}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              role="progressbar"
                              aria-label={translate(currentLanguage, "practiceListPage.progress2")}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={row.stats.progress}
                              className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
                            >
                              <div
                                className="h-full rounded-full bg-indigo-500 transition-all duration-500 dark:bg-[#7EA2F8]"
                                style={{ width: `${row.stats.progress}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-bold text-indigo-600 dark:text-[#7EA2F8]">
                              {row.stats.progress}%
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div
                              role="progressbar"
                              aria-label={translate(currentLanguage, "practiceListPage.accuracy")}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={noAnswers ? 0 : row.stats.accuracy}
                              className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${accBar}`}
                                style={{ width: `${noAnswers ? 0 : row.stats.accuracy}%` }}
                              />
                            </div>
                            <span
                              className={`w-10 text-right text-xs font-bold ${noAnswers ? "text-gray-300 dark:text-slate-500" : accText}`}
                            >
                              {noAnswers ? "—" : `${row.stats.accuracy}%`}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className={`min-w-0 p-5 sm:p-6 ${CARD}`}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-[#F8FAFC]">
              <ChevronRight className="h-4 w-4 text-blue-500 dark:text-[#7EA2F8]" />
              {translate(
                currentLanguage,
                "practiceListPage.recommendedNextActions",
              )}
            </h3>

            <div className="w-full min-w-0 overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[72%]" />
                  <col className="w-[28%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 dark:border-[rgba(255,255,255,0.10)] dark:text-[#94A3B8]">
                    <th className="truncate pb-2 pl-3 pr-2 text-left font-semibold">
                      {translate(currentLanguage, "practiceListPage.item")}
                    </th>
                    <th className="truncate pb-2 pr-3 text-right font-semibold">
                      {translate(currentLanguage, "practiceListPage.action")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50 dark:divide-[rgba(255,255,255,0.08)]">
                  {[...summaryRows]
                    .sort(
                      (a, b) =>
                        a.stats.accuracy - b.stats.accuracy ||
                        a.stats.progress - b.stats.progress,
                    )
                    .slice(0, 2)
                    .map((row) => (
                      <tr
                        key={row.id}
                        className="group"
                      >
                        <td className={`min-w-0 rounded-l-2xl py-3 pl-3 pr-2 ${rowHover}`}>
                          <p
                            className="truncate font-semibold text-gray-700 dark:text-[#F8FAFC]"
                            title={`${getCategoryLabel(row, currentLanguage)}${translate(currentLanguage, "practiceListPage.fundamentals")}`}
                          >
                            {getCategoryLabel(row, currentLanguage)}
                            {translate(
                              currentLanguage,
                              "practiceListPage.fundamentals",
                            )}
                          </p>

                          <p className="truncate text-xs text-gray-400 dark:text-[#94A3B8]">
                            {row.stats.answeredCount === 0
                              ? translate(
                                  currentLanguage,
                                  "practiceListPage.notAttemptedYet",
                                )
                              : `${translate(
                                  currentLanguage,
                                  "practiceListPage.accuracy",
                                )} ${row.stats.accuracy}%`}
                          </p>
                        </td>

                        <td className={`min-w-0 rounded-r-2xl py-3 pl-2 pr-3 text-right ${rowHover}`}>
                          <button
                            onClick={() =>
                              startCategory(row.subjectIds, row.id)
                            }
                            className="ml-auto block max-w-full truncate rounded-md !border-0 !bg-transparent !p-0 !shadow-none !translate-y-0 hover:!bg-transparent hover:!shadow-none hover:!translate-y-0 focus:!bg-transparent text-right text-xs font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline dark:text-[#7EA2F8] dark:hover:text-blue-300"
                          >
                            {translate(
                              currentLanguage,
                              "practiceListPage.solve",
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}

                  <tr className="group">
                    <td className={`min-w-0 rounded-l-2xl py-3 pl-3 pr-2 ${rowHover}`}>
                      <p
                        className="truncate font-semibold text-gray-700 dark:text-[#F8FAFC]"
                        title={translate(
                          currentLanguage,
                          "practiceListPage.checkYourLevelWithAMockExam",
                        )}
                      >
                        {translate(
                          currentLanguage,
                          "practiceListPage.checkYourLevelWithAMockExam",
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-400 dark:text-[#94A3B8]">
                        {translate(
                          currentLanguage,
                          "practiceListPage.takeItUnderRealExamTiming",
                        )}
                      </p>
                    </td>

                    <td className={`min-w-0 rounded-r-2xl py-3 pl-2 pr-3 text-right ${rowHover}`}>
                      <button
                        onClick={() => onNavigate("mock-exam")}
                        className="ml-auto block max-w-full truncate rounded-md !border-0 !bg-transparent !p-0 !shadow-none !translate-y-0 hover:!bg-transparent hover:!shadow-none hover:!translate-y-0 focus:!bg-transparent text-right text-xs font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline dark:text-[#7EA2F8] dark:hover:text-blue-300"
                      >
                        {translate(
                          currentLanguage,
                          "practiceListPage.goToMockExam",
                        )}
                      </button>
                    </td>
                  </tr>

                  {incorrectCount > 0 && (
                    <tr className="group">
                      <td className={`min-w-0 rounded-l-2xl py-3 pl-3 pr-2 ${rowHover}`}>
                        <p
                          className="truncate font-semibold text-gray-700 dark:text-[#F8FAFC]"
                          title={translate(
                            currentLanguage,
                            "practiceListPage.reviewMissedQuestions",
                          )}
                        >
                          {translate(
                            currentLanguage,
                            "practiceListPage.reviewMissedQuestions",
                          )}
                        </p>

                        <p className="truncate text-xs text-gray-400 dark:text-[#94A3B8]">
                          {translate(
                            currentLanguage,
                            "practiceListPage.unreviewedCount",
                            { count: incorrectCount },
                          )}
                        </p>
                      </td>

                      <td className={`min-w-0 rounded-r-2xl py-3 pl-2 pr-3 text-right ${rowHover}`}>
                        <button
                          onClick={startReview}
                          className="ml-auto block max-w-full truncate rounded-md !border-0 !bg-transparent !p-0 !shadow-none !translate-y-0 hover:!bg-transparent hover:!shadow-none hover:!translate-y-0 focus:!bg-transparent text-right text-xs font-semibold text-pink-600 transition hover:text-pink-700 hover:underline dark:text-[#F4B0D0] dark:hover:text-pink-200"
                        >
                          {translate(
                            currentLanguage,
                            "practiceListPage.review2",
                          )}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}