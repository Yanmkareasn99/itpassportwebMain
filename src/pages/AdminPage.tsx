import { languageLocales, translate } from '../i18n';
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Plus, Edit2, Trash2, X, Save, ChevronDown, ChevronUp,
  Users, BookOpen, Layers, BarChart2, CheckCircle, XCircle, Search, RefreshCw,
} from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getLocalizedExplanation } from '../lib/localizedQuestion';
import { useLanguage } from '../contexts/LanguageContext';
import { Page, Question, Subject, AnswerChoice, Profile } from '../types';

interface AdminPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

type Tab = 'questions' | 'subjects' | 'users' | 'stats';

/* ── Question form state ─────────────────────────────── */
interface ChoiceForm {
  id?: string;
  choice_text: string;
  is_correct: boolean;
  sort_order: number;
}

interface QuestionForm {
  subject_id: string;
  question_number: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'tree';
  explanation: string;
  explanation_en: string;
  explanation_vi: string;
  difficulty: number;
  points: number;
  image_url: string;
  choices: ChoiceForm[];
}

const emptyForm = (): QuestionForm => ({
  subject_id: '',
  question_number: '',
  question_text: '',
  question_type: 'multiple_choice',
  explanation: '',
  explanation_en: '',
  explanation_vi: '',
  difficulty: 3,
  points: 1,
  image_url: '',
  choices: [
    { choice_text: '', is_correct: false, sort_order: 1 },
    { choice_text: '', is_correct: false, sort_order: 2 },
    { choice_text: '', is_correct: false, sort_order: 3 },
    { choice_text: '', is_correct: false, sort_order: 4 },
  ],
});

/* ── Subject form ────────────────────────────────────── */
interface SubjectForm {
  name: string;
  description: string;
  color: string;
}

const emptySubjectForm = (): SubjectForm => ({ name: '', description: '', color: '#3B82F6' });

/* ── Difficulty badge ────────────────────────────────── */
function DiffBadge({ d }: { d: number }) {
  const { language } = useLanguage();
  const map = ['', 'bg-emerald-100 text-emerald-700', 'bg-blue-100 text-blue-700', 'bg-amber-100 text-amber-700', 'bg-orange-100 text-orange-700', 'bg-red-100 text-red-700'];
  const label = [
    '',
    translate(language, 'adminPage.easy'),
    translate(language, 'adminPage.starter'),
    translate(language, 'adminPage.mid'),
    translate(language, 'adminPage.hard'),
    translate(language, 'adminPage.expert'),
  ];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[d] ?? map[3]}`}>{label[d] ?? d}</span>;
}

/* ══════════════════════════════════════════════════════ */
export default function AdminPage({ currentPage, onNavigate }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('questions');
  const { language } = useLanguage();

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title={translate(language, 'adminPage.admin')} subtitle={translate(language, 'adminPage.admin')}>
      <div className="max-w-6xl mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
          {([
            { id: 'questions', label: translate(language, 'adminPage.questions'), icon: BookOpen },
            { id: 'subjects', label: translate(language, 'adminPage.subjects'), icon: Layers },
            { id: 'users', label: translate(language, 'adminPage.users'), icon: Users },
            { id: 'stats', label: translate(language, 'adminPage.stats'), icon: BarChart2 },
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition shrink-0 whitespace-nowrap ${
                tab === id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'questions' && <QuestionsTab />}
        {tab === 'subjects' && <SubjectsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </Layout>
  );
}

/* ══════════════════════════════════════════════════════
   QUESTIONS TAB
══════════════════════════════════════════════════════ */
function QuestionsTab() {
  const { language } = useLanguage();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<QuestionForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: qs }, { data: ss }] = await Promise.all([
      supabase.from('questions').select('*, answer_choices(*)').order('question_number'),
      supabase.from('subjects').select('*').order('name'),
    ]);
    if (qs) setQuestions(qs as Question[]);
    if (ss) setSubjects(ss as Subject[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = questions.filter(q => {
    const matchSub = filterSubject === 'all' || q.subject_id === filterSubject;
    const matchSearch = !search || q.question_text.toLowerCase().includes(search.toLowerCase()) || String(q.question_number).includes(search);
    return matchSub && matchSearch;
  });

  function startNew() {
    const defaultSubject = subjects[0]?.id ?? '';
    setForm({ ...emptyForm(), subject_id: defaultSubject });
    setEditingId('new');
    setError('');
  }

  function startEdit(q: Question) {
    const choices: ChoiceForm[] = ((q.answer_choices ?? []) as AnswerChoice[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({ id: c.id, choice_text: c.choice_text, is_correct: c.is_correct, sort_order: c.sort_order }));
    setForm({
      subject_id: q.subject_id,
      question_number: String(q.question_number),
      question_text: q.question_text,
      question_type: q.question_type as QuestionForm['question_type'],
      explanation: q.explanation ?? '',
      explanation_en: q.explanation_en ?? '',
      explanation_vi: q.explanation_vi ?? '',
      difficulty: q.difficulty ?? 3,
      points: q.points ?? 1,
      image_url: q.image_url ?? '',
      choices,
    });
    setEditingId(q.id);
    setError('');
  }

  async function handleSave() {
    setError('');
    if (!form.question_text.trim()) { setError(translate(language, 'adminPage.pleaseEnterTheQuestionText')); return; }
    if (!form.subject_id) { setError(translate(language, 'adminPage.pleaseSelectASubject')); return; }
    const correctCount = form.choices.filter(c => c.is_correct).length;
    if (correctCount === 0) { setError(translate(language, 'adminPage.selectAtLeastOneCorrectChoice')); return; }
    const filledChoices = form.choices.filter(c => c.choice_text.trim());
    if (filledChoices.length < 2) { setError(translate(language, 'adminPage.enterAtLeastTwoChoices')); return; }

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
        difficulty: form.difficulty,
        points: form.points,
        image_url: form.image_url.trim() || null,
      };

      let questionId = editingId !== 'new' ? editingId! : '';

      if (editingId === 'new') {
        const { data, error: err } = await supabase.from('questions').insert(qPayload).select().single();
        if (err) throw err;
        questionId = data.id;
      } else {
        const { error: err } = await supabase.from('questions').update(qPayload).eq('id', questionId);
        if (err) throw err;
        await supabase.from('answer_choices').delete().eq('question_id', questionId);
      }

      const choicePayloads = filledChoices.map((c, i) => ({
        question_id: questionId,
        choice_text: c.choice_text.trim(),
        is_correct: c.is_correct,
        sort_order: i + 1,
      }));
      const { error: choiceErr } = await supabase.from('answer_choices').insert(choicePayloads);
      if (choiceErr) throw choiceErr;

      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : translate(language, 'adminPage.failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(translate(language, 'adminPage.deleteThisQuestion'))) return;
    await supabase.from('answer_choices').delete().eq('question_id', id);
    await supabase.from('questions').delete().eq('id', id);
    await load();
  }

  function setChoice(idx: number, patch: Partial<ChoiceForm>) {
    setForm(f => ({
      ...f,
      choices: f.choices.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  }

  function addChoice() {
    setForm(f => ({
      ...f,
      choices: [...f.choices, { choice_text: '', is_correct: false, sort_order: f.choices.length + 1 }],
    }));
  }

  function removeChoice(idx: number) {
    setForm(f => ({ ...f, choices: f.choices.filter((_, i) => i !== idx) }));
  }

  if (editingId !== null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">
            {editingId === 'new' ? (translate(language, 'adminPage.addQuestion')) : (translate(language, 'adminPage.editQuestion'))}
          </h2>
          <button onClick={() => setEditingId(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
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
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.subject')}</label>
            <select
              value={form.subject_id}
              onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.questionNumber')}</label>
            <input
              type="number"
              value={form.question_number}
              onChange={e => setForm(f => ({ ...f, question_number: e.target.value }))}
              placeholder={translate(language, 'adminPage.eG1')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.questionType')}</label>
            <select
              value={form.question_type}
              onChange={e => setForm(f => ({ ...f, question_type: e.target.value as QuestionForm['question_type'] }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="multiple_choice">{translate(language, 'adminPage.multipleChoice')}</option>
              <option value="true_false">{translate(language, 'adminPage.trueFalse')}</option>
              <option value="tree">{translate(language, 'adminPage.tree')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.difficulty')} ({form.difficulty})</label>
            <input
              type="range" min={1} max={5}
              value={form.difficulty}
              onChange={e => setForm(f => ({ ...f, difficulty: parseInt(e.target.value) }))}
              className="w-full mt-2"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.points')}</label>
            <input
              type="number" min={1}
              value={form.points}
              onChange={e => setForm(f => ({ ...f, points: parseInt(e.target.value) || 1 }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.imageUrlOptional')}</label>
            <input
              type="url"
              value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.questionText')}</label>
          <textarea
            value={form.question_text}
            onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
            rows={4}
            placeholder={translate(language, 'adminPage.enterTheQuestionText')}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.explanationJapanese')}</label>
          <textarea
            value={form.explanation}
            onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
            rows={3}
            placeholder={translate(language, 'adminPage.enterAnExplanation')}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, 'adminPage.explanationEnglish')}
            </label>
            <textarea
              value={form.explanation_en}
              onChange={e => setForm(f => ({ ...f, explanation_en: e.target.value }))}
              rows={3}
              placeholder={translate(language, 'adminPage.englishExplanationPlaceholder')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {translate(language, 'adminPage.explanationVietnamese')}
            </label>
            <textarea
              value={form.explanation_vi}
              onChange={e => setForm(f => ({ ...f, explanation_vi: e.target.value }))}
              rows={3}
              placeholder={translate(language, 'adminPage.vietnameseExplanationPlaceholder')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        </div>

        <p className="mb-4 text-xs text-gray-400">
          {translate(language, 'adminPage.questionsAndChoicesStayInJapaneseOnlyExplanations')}
        </p>

        {/* Choices */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500">{translate(language, 'adminPage.choices')}</label>
            <button onClick={addChoice} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> {translate(language, 'adminPage.add')}
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
                      setForm(f => ({
                        ...f,
                        choices: f.choices.map((ch, idx) => ({ ...ch, is_correct: idx === i })),
                      }));
                    }
                  }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                    c.is_correct ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {c.is_correct && <CheckCircle className="w-4 h-4 text-white" />}
                </button>
                <input
                  type="text"
                  value={c.choice_text}
                  onChange={e => setChoice(i, { choice_text: e.target.value })}
                  placeholder={translate(language, 'adminPage.choicePlaceholder', { number: i + 1 })}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {form.choices.length > 2 && (
                  <button onClick={() => removeChoice(i)} className="p-1 text-gray-400 hover:text-red-500 transition">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">{translate(language, 'adminPage.clickTheRoundButtonToSelectTheCorrect')}</p>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">
            {translate(language, 'adminPage.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {translate(language, 'adminPage.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={translate(language, 'adminPage.searchQuestions')}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">{translate(language, 'adminPage.allSubjects')}</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-500">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          {translate(language, 'adminPage.addQuestion')}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            {loading ? (translate(language, 'adminPage.loading')) : `${filtered.length}${translate(language, 'adminPage.items')}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{translate(language, 'adminPage.noQuestionsYetStartByAddingOne')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(q => {
              const sub = subjects.find(s => s.id === q.subject_id);
              const isExpanded = expandedId === q.id;
              const choices = ((q.answer_choices ?? []) as AnswerChoice[]).sort((a, b) => a.sort_order - b.sort_order);
              const explanation = getLocalizedExplanation(q, language);
              return (
                <div key={q.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-gray-400 w-8 shrink-0 mt-0.5">#{q.question_number}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sub && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${sub.color}20`, color: sub.color }}>
                            {sub.name}
                          </span>
                        )}
                        <DiffBadge d={q.difficulty ?? 3} />
                      </div>
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2">{q.question_text}</p>
                      {isExpanded && (
                        <div className="mt-3 space-y-1.5">
                          {choices.map(c => (
                            <div key={c.id} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${c.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-600'}`}>
                              {c.is_correct ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />}
                              {c.choice_text}
                            </div>
                          ))}
                          {explanation && (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                              <strong>{translate(language, 'adminPage.explanation')}</strong> {explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : q.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(q)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
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
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SUBJECTS TAB
══════════════════════════════════════════════════════ */
function SubjectsTab() {
  const { language } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptySubjectForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('subjects').select('*').order('name');
    if (data) setSubjects(data as Subject[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() { setForm(emptySubjectForm()); setEditingId('new'); setError(''); }
  function startEdit(s: Subject) { setForm({ name: s.name, description: s.description ?? '', color: s.color ?? '#3B82F6' }); setEditingId(s.id); setError(''); }

  async function handleSave() {
    if (!form.name.trim()) { setError(translate(language, 'adminPage.subjectNameRequired')); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, color: form.color };
      if (editingId === 'new') {
        const { error: err } = await supabase.from('subjects').insert(payload);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('subjects').update(payload).eq('id', editingId!);
        if (err) throw err;
      }
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : translate(language, 'adminPage.failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(translate(language, 'adminPage.deleteSubjectConfirmation'))) return;
    await supabase.from('subjects').delete().eq('id', id);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition">
          <Plus className="w-4 h-4" />{translate(language, 'adminPage.addSubject')}
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">{editingId === 'new' ? translate(language, 'adminPage.addSubject') : translate(language, 'adminPage.editSubject')}</h3>
            <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.subjectName')}</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder={translate(language, 'adminPage.subjectNamePlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.description')}</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder={translate(language, 'adminPage.descriptionOptional')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{translate(language, 'adminPage.color')}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
                <span className="text-sm text-gray-600 font-mono">{form.color}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">{translate(language, 'adminPage.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{translate(language, 'adminPage.save')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{translate(language, 'adminPage.noSubjects')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {subjects.map(s => (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#ccc' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                  {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   USERS TAB
══════════════════════════════════════════════════════ */
function UsersTab() {
  const { language } = useLanguage();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAdmin(user: Profile) {
    setSaving(user.id);
    setError('');
    const { error: updateError } = await supabase.rpc('set_profile_admin', {
      target_user_id: user.id,
      new_is_admin: !user.is_admin,
    });
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{loading ? translate(language, 'adminPage.loading') : translate(language, 'adminPage.userCount', { count: users.length })}</span>
        <button onClick={load} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-600 bg-red-50">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{translate(language, 'adminPage.noUsers')}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-4 p-4">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-blue-600">{u.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                <p className="text-xs text-gray-400">
                  {u.student_id && translate(language, 'adminPage.studentIdValue', { value: u.student_id })}
                  {u.class_name && translate(language, 'adminPage.classValue', { value: u.class_name })}
                  {new Date(u.created_at).toLocaleDateString(languageLocales[language])}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {u.is_admin && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />{translate(language, 'adminPage.administrator')}
                  </span>
                )}
                <button
                  onClick={() => toggleAdmin(u)}
                  disabled={saving === u.id}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                    u.is_admin
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  } disabled:opacity-50`}
                >
                  {saving === u.id
                    ? '...'
                    : u.is_admin
                      ? translate(language, 'adminPage.removeAdministrator')
                      : translate(language, 'adminPage.makeAdministrator')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   STATS TAB
══════════════════════════════════════════════════════ */
interface StatsData {
  totalQuestions: number;
  totalSubjects: number;
  totalUsers: number;
  totalPracticeSessions: number;
  totalExamSessions: number;
  avgAccuracy: number;
}

function StatsTab() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { count: qCount },
        { count: sCount },
        { count: uCount },
        { data: ps },
        { data: es },
      ] = await Promise.all([
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('subjects').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('practice_sessions').select('correct_answers, total_questions'),
        supabase.from('exam_sessions').select('correct_answers, total_questions'),
      ]);

      const allSessions = [...(ps ?? []), ...(es ?? [])];
      const totalQ = allSessions.reduce((a, s) => a + (s.total_questions ?? 0), 0);
      const totalC = allSessions.reduce((a, s) => a + (s.correct_answers ?? 0), 0);
      const avgAcc = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;

      setStats({
        totalQuestions: qCount ?? 0,
        totalSubjects: sCount ?? 0,
        totalUsers: uCount ?? 0,
        totalPracticeSessions: ps?.length ?? 0,
        totalExamSessions: es?.length ?? 0,
        avgAccuracy: avgAcc,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  const cards = [
    { label: translate(language, 'adminPage.totalQuestions'), value: stats!.totalQuestions, color: 'blue', suffix: translate(language, 'adminPage.questionsSuffix') },
    { label: translate(language, 'adminPage.subjectCount'), value: stats!.totalSubjects, color: 'purple', suffix: translate(language, 'adminPage.subjectsSuffix') },
    { label: translate(language, 'adminPage.userTotal'), value: stats!.totalUsers, color: 'emerald', suffix: translate(language, 'adminPage.peopleSuffix') },
    { label: translate(language, 'adminPage.practiceSessions'), value: stats!.totalPracticeSessions, color: 'amber', suffix: translate(language, 'adminPage.sessionsSuffix') },
    { label: translate(language, 'adminPage.mockExamSessions'), value: stats!.totalExamSessions, color: 'rose', suffix: translate(language, 'adminPage.sessionsSuffix') },
    { label: translate(language, 'adminPage.overallAccuracy'), value: stats!.avgAccuracy, color: 'teal', suffix: '%' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-600',
    teal: 'bg-teal-50 text-teal-600',
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
          <p className="text-xs font-semibold text-gray-400 mb-2">{c.label}</p>
          <p className={`text-2xl sm:text-4xl font-bold ${colorMap[c.color]?.split(' ')[1]}`}>
            {c.value.toLocaleString()}<span className="text-sm sm:text-lg font-medium ml-1">{c.suffix}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
