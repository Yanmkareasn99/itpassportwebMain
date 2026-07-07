import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, Lightbulb, BookOpen, MessageCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getChatReply, ChatMessage } from '../lib/aiChat';
import { useAuth } from '../contexts/AuthContext';
import { Page, Question, Subject } from '../types';

interface AIChatPageProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const starterPrompts = [
  '今日の学習計画を作って',
  '基本情報の午後問題の勉強法を教えて',
  'この問題を解く考え方を整理して',
  '苦手科目を克服する方法を教えて',
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm whitespace-pre-wrap text-sm leading-6 ${isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100 text-gray-700'}`}>
        {message.content}
      </div>
    </div>
  );
}

export default function AIChatPage({ currentPage, onNavigate }: AIChatPageProps) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      content: '学習の相談窓口です。問題の解き方、勉強計画、用語の整理をそのまま聞いてください。',
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
      if (profile?.id) {
        try {
          const { data: msgs } = await supabase
            .from('ai_chat_messages')
            .select('role, content, created_at')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: true })
            .limit(500);

          if (msgs && msgs.length > 0) {
            const loaded = msgs.map((m: any) => ({
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
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const selectedSubject = useMemo(() => subjects[0] ?? null, [subjects]);

  async function sendMessage(text?: string) {
    const content = (text ?? prompt).trim();
    if (!content || sending) return;
    console.debug('[AI] sendMessage invoked, content length=', content.length);

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
      console.warn('Failed to persist user message', err);
    }
    const reply = await getChatReply(content, {
      profileName: profile?.name ?? 'あなた',
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

  function resetChat() {
    setMessages([
      {
        id: createId(),
        role: 'assistant',
        content: '学習の相談窓口です。問題の解き方、勉強計画、用語の整理をそのまま聞いてください。',
        createdAt: Date.now(),
      },
    ]);
  }

  return (
    <Layout currentPage={currentPage} onNavigate={onNavigate} title="AIチャット" subtitle="学習アシスタント">
      <div className="max-w-5xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-[70vh] overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-violet-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 text-blue-600 text-xs font-semibold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Study Assistant
                </div>
                <h2 className="text-2xl font-bold text-gray-800">わからないことを、そのまま質問してください</h2>
                <p className="text-sm text-gray-500 mt-1">学習計画、用語の整理、問題の考え方を対話形式でサポートします。</p>
              </div>
              <button
                onClick={resetChat}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                <RotateCcw className="w-4 h-4" />
                リセット
              </button>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-4 bg-gray-50 overflow-y-auto">
            {messages.map(message => <ChatBubble key={message.id} message={message} />)}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-400 flex items-center gap-2 shadow-sm">
                  <MessageCircle className="w-4 h-4 animate-pulse" />
                  AIが考えています...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-gray-100 bg-white">
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
                placeholder="例: この問題の考え方を教えて / 勉強計画を作って"
                className="flex-1 resize-none min-h-[56px] max-h-40 px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                rows={2}
              />
              <button
                type="submit"
                disabled={sending || !prompt.trim()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                送信
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3 text-gray-700 font-semibold">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              すぐ聞ける質問
            </div>
            <div className="space-y-2">
              {starterPrompts.map(item => (
                <button
                  key={item}
                  onClick={() => void sendMessage(item)}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3 text-gray-700 font-semibold">
              <BookOpen className="w-4 h-4 text-blue-500" />
              直近の学習データ
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">科目</p>
                <p className="font-medium text-gray-700">{selectedSubject?.name ?? '科目データなし'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">最近の問題</p>
                <p className="text-gray-600">{recentQuestions.length > 0 ? `${recentQuestions.length}問を参照できます` : 'まだ読み込みできていません'}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl p-5 text-white shadow-sm">
            <p className="text-sm font-semibold mb-1">AIチャットの使い方</p>
            <p className="text-sm text-violet-50 leading-6">
              困っている問題文を貼ると、解く順番・見るべきポイント・復習方法を整理して返します。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}