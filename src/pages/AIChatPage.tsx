import { translate } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, Lightbulb, MessageCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getChatReply, ChatMessage } from '../lib/aiChat';
import { useAuth } from '../contexts/AuthContext';
import { Page, Question, Subject } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface AIChatPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm whitespace-pre-wrap break-words text-sm leading-6 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-700 dark:text-slate-100'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export default function AIChatPage({ currentPage, onNavigate }: AIChatPageProps) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const profileId = profile?.id;

  const starterPrompts = [
    translate(language, 'aiChatPage.starterPlan'),
    translate(language, 'aiChatPage.starterAfternoon'),
    translate(language, 'aiChatPage.starterThinking'),
    translate(language, 'aiChatPage.starterWeakSubject'),
  ];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      content: translate(language, 'aiChatPage.welcome'),
      createdAt: Date.now(),
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<Question[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadData() {
      const [{ data: subjectData }, { data: questionData }] = await Promise.all([
        supabase.from('subjects').select('*').order('name'),
        supabase.from('questions').select('id, subject_id, question_number, question_text, question_type, image_url, explanation, difficulty, points').order('created_at', { ascending: false }).limit(8),
      ]);
      if (subjectData) setSubjects(subjectData as Subject[]);
      if (questionData) setRecentQuestions(questionData as Question[]);

      // load persisted chat messages for logged-in user
      if (profileId) {
        try {
          const { data: msgs } = await supabase
            .from('ai_chat_messages')
            .select('role, content, created_at')
            .eq('user_id', profileId)
            .order('created_at', { ascending: true })
            .limit(500);

          if (msgs && msgs.length > 0) {
            const loaded = (msgs as StoredChatMessage[]).map(m => ({
              id: `${new Date(m.created_at).getTime()}-${Math.random().toString(36).slice(2,6)}`,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
              createdAt: new Date(m.created_at).getTime(),
            }));
            setMessages(loaded);
          }
        } catch (err) {
          console.warn('Failed to load ai chat messages', err);
        }
      }
    }

    loadData();
  }, [profileId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const selectedSubject = useMemo(() => subjects[0] ?? null, [subjects]);

  async function sendMessage(text?: string) {
    const content = (text ?? prompt).trim();
    if (!content || sending) return;

    const history = messages.map(message => ({ role: message.role, content: message.content }));

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content,
      createdAt: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    setSending(true);

    // persist user message for logged-in users
    try {
      if (profile?.id) {
        await supabase.from('ai_chat_messages').insert({
          user_id: profile.id,
          role: 'user',
          content,
        });
      }
    } catch (err) {
      console.warn('Failed to persist message', err);
    }
    const reply = await getChatReply(content, {
      language,
      profileName: profile?.name ?? translate(language, 'common.you'),
      subject: selectedSubject,
      recentQuestions,
      history,
    });

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: reply,
      createdAt: Date.now(),
    };

    setMessages(prev => [...prev, assistantMessage]);
    // persist assistant message
    try {
      if (profile?.id) {
        await supabase.from('ai_chat_messages').insert({
          user_id: profile.id,
          role: 'assistant',
          content: reply,
        });
      }
    } catch (err) {
      console.warn('Failed to persist assistant message', err);
    }
    setSending(false);
  }

  async function resetChat() {
    if (profileId) {
      const { error } = await supabase
        .from('ai_chat_messages')
        .delete()
        .eq('user_id', profileId);
      if (error) console.warn('Failed to clear persisted chat messages', error);
    }
    setMessages([
      {
        id: createId(),
        role: 'assistant',
        content: translate(language, 'aiChatPage.welcome'),
        createdAt: Date.now(),
      },
    ]);
  }

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={onNavigate}
      title={translate(language, 'aiChatPage.aiChat')}
      subtitle={translate(language, 'aiChatPage.studyAssistant')}
    >
      <div className="app-shell grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col min-h-[70vh] overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-slate-800 dark:to-slate-900">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-800 text-blue-600 dark:text-blue-300 text-xs font-semibold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  {translate(language, 'aiChatPage.studyAssistant')}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-slate-100">{translate(language, 'aiChatPage.heroTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-slate-300 mt-1">{translate(language, 'aiChatPage.heroDescription')}</p>
              </div>
              <button
                onClick={() => void resetChat()}
                className="shrink-0 self-start inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-gray-600 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                {translate(language, 'aiChatPage.reset')}
              </button>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-4 bg-gray-50 dark:bg-slate-950 overflow-y-auto">
            {messages.map(message => <ChatBubble key={message.id} message={message} />)}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-gray-400 dark:text-slate-300 flex items-center gap-2 shadow-sm">
                  <MessageCircle className="w-4 h-4 animate-pulse" />
                  {translate(language, 'aiChatPage.thinking')}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
            <form
              className="flex items-end gap-3"
              onSubmit={e => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={
                  translate(language, 'aiChatPage.exampleExplainThisQuestionCreateAStudyPlan')
                }
                className="flex-1 resize-none min-h-[56px] max-h-40 px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                rows={2}
              />
              <button
                type="submit"
                disabled={sending || !prompt.trim()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                {translate(language, 'aiChatPage.send')}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3 text-gray-700 dark:text-slate-200 font-semibold">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              {translate(language, 'aiChatPage.quickQuestions')}
            </div>
            <div className="space-y-2">
              {starterPrompts.map(item => (
                <button
                  key={item}
                  onClick={() => void sendMessage(item)}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 text-sm text-gray-600 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-300 transition"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          
         
        </div>
      </div>
    </Layout>
  );
}
