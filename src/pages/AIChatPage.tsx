import { translate } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Send, RotateCcw, Lightbulb, MessageCircle, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { getChatReply, ChatMessage } from '../lib/aiChat';
import { useAuth } from '../contexts/AuthContext';
import { Page, Question, Subject } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { takeAiChatHandoff } from '../lib/aiChatHandoff';

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
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm whitespace-pre-wrap break-words text-sm leading-6 ${isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100 text-gray-700'}`}>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<Question[]>([]);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handoffRef = useRef<ReturnType<typeof takeAiChatHandoff> | undefined>(undefined);
  const handoffPersistedRef = useRef(false);

  useEffect(() => {
    if (handoffRef.current === undefined) {
      handoffRef.current = takeAiChatHandoff();
    }
    const handoff = handoffRef.current;
    let cancelled = false;

    async function loadData() {
      const [{ data: subjectData }, { data: questionData }] = await Promise.all([
        supabase.from('subjects').select('*').order('name'),
        supabase.from('questions').select('id, subject_id, question_number, question_text, question_type, image_url, explanation, difficulty, points').order('created_at', { ascending: false }).limit(8),
      ]);
      if (cancelled) return;
      if (subjectData) setSubjects(subjectData as Subject[]);
      if (questionData) setRecentQuestions(questionData as Question[]);

      // load persisted chat messages for logged-in user
      let loadedMessages: ChatMessage[] = [];
      if (profileId) {
        try {
          const { data: msgs } = await supabase
            .from('ai_chat_messages')
            .select('role, content, created_at')
            .eq('user_id', profileId)
            .order('created_at', { ascending: true })
            .limit(500);

          if (cancelled) return;
          if (msgs && msgs.length > 0) {
            loadedMessages = (msgs as StoredChatMessage[]).map(m => ({
              id: `${new Date(m.created_at).getTime()}-${Math.random().toString(36).slice(2,6)}`,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
              createdAt: new Date(m.created_at).getTime(),
            }));
          }
        } catch (err) {
          console.warn('Failed to load ai chat messages', err);
        }
      }

      const handoffMessages: ChatMessage[] = handoff
        ? handoff.turns.map((turn, index) => ({
            id: `handoff-${handoff.createdAt}-${index}`,
            role: turn.role,
            content: turn.content,
            createdAt: handoff.createdAt + index,
          }))
        : [];

      if (!cancelled && (loadedMessages.length > 0 || handoffMessages.length > 0)) {
        setMessages([...loadedMessages, ...handoffMessages]);
      }

      if (profileId && handoff && !handoffPersistedRef.current) {
        const { error } = await supabase.from('ai_chat_messages').insert(
          handoff.turns.map(turn => ({
            user_id: profileId,
            role: turn.role,
            content: turn.content,
          })),
        );
        if (error) {
          console.warn('Failed to persist AI chat handoff', error);
        } else {
          handoffPersistedRef.current = true;
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const updateScrollControls = useCallback(() => {
    const container = chatScrollRef.current;
    if (!container) return;

    const edgeThreshold = 12;
    const hasOverflow = container.scrollHeight > container.clientHeight + edgeThreshold;
    setCanScrollUp(hasOverflow && container.scrollTop > edgeThreshold);
    setCanScrollDown(
      hasOverflow
        && container.scrollTop + container.clientHeight < container.scrollHeight - edgeThreshold,
    );
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    const frame = window.requestAnimationFrame(updateScrollControls);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, updateScrollControls]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateScrollControls);
    resizeObserver?.observe(container);
    window.addEventListener('resize', updateScrollControls);
    updateScrollControls();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollControls);
    };
  }, [updateScrollControls]);

  function scrollChatToTop() {
    chatScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollChatToBottom() {
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  // auto-grow the textarea up to 160px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // beat any global (dark mode) textarea background rule
    el.style.setProperty('background', 'transparent', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [prompt]);

  // close the "+" menu when clicking / tapping outside of it
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      const insideMenu = menuRef.current?.contains(target);
      const insidePlus = plusBtnRef.current?.contains(target);
      if (!insideMenu && !insidePlus) {
        setMenuOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

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
      console.warn('Failed to persist user message', err);
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
      <div className="w-full">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex h-[calc(100dvh-10rem)] min-h-[28rem] w-full flex-col overflow-hidden md:h-[calc(100dvh-8rem)]">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-violet-50 dark:border-blue-900 dark:from-blue-950 dark:to-blue-900">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 text-blue-600 text-xs font-semibold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  {translate(language, 'aiChatPage.studyAssistant')}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{translate(language, 'aiChatPage.heroTitle')}</h2>
                <p className="text-sm text-gray-500 mt-1">{translate(language, 'aiChatPage.heroDescription')}</p>
              </div>
              <button type="button"
                onClick={() => void resetChat()}
                className="shrink-0 self-start inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                {translate(language, 'aiChatPage.reset')}
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={chatScrollRef}
              role="log"
              aria-label={translate(language, 'aiChatPage.chatHistory')}
              onScroll={updateScrollControls}
              className="h-full overflow-y-auto bg-gray-50 p-5"
            >
              <div className="space-y-4">
                {messages.map(message => <ChatBubble key={message.id} message={message} />)}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-400 flex items-center gap-2 shadow-sm">
                      <MessageCircle className="w-4 h-4 animate-pulse" />
                      {translate(language, 'aiChatPage.thinking')}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {canScrollUp && (
              <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
                <button
                  type="button"
                  onClick={scrollChatToTop}
                  aria-label={translate(language, 'aiChatPage.scrollToTop')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-md backdrop-blur transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:!scale-95 active:shadow-sm motion-reduce:active:!scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
              </div>
            )}

            {canScrollDown && (
              <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
                <button
                  type="button"
                  onClick={scrollChatToBottom}
                  aria-label={translate(language, 'aiChatPage.scrollToBottom')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-md backdrop-blur transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:!scale-95 active:shadow-sm motion-reduce:active:!scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4 border-t border-gray-100 bg-white">
            <form
              onSubmit={e => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <div className="relative">
                {/* Quick questions card (always white, even in dark mode) */}
                {menuOpen && (
                  <div ref={menuRef} className="absolute bottom-full left-0 mb-3 w-[calc(100vw-3rem)] max-w-sm rounded-2xl border border-gray-200 !bg-white p-2 shadow-xl z-20">
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-xs font-semibold !text-gray-500">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      {translate(language, 'aiChatPage.quickQuestions')}
                    </div>
                    <div className="space-y-0.5">
                      {starterPrompts.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            void sendMessage(item);
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm !text-gray-700 hover:!bg-gray-100 transition-colors"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input pill: + | text | send */}
                <div className="flex items-end gap-1 rounded-3xl border border-gray-200 bg-white p-2 shadow-sm transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                  <button
                    ref={plusBtnRef}
                    type="button"
                    onClick={() => setMenuOpen(open => !open)}
                    aria-label={translate(language, 'aiChatPage.quickQuestions')}
                    aria-expanded={menuOpen}
                    className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                      menuOpen ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
                    }`}
                  >
                    <Plus className={`w-5 h-5 transition-transform duration-200 ${menuOpen ? 'rotate-45' : ''}`} />
                  </button>

                  <textarea
                    ref={textareaRef}
                    onFocus={() => setMenuOpen(false)}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder={translate(language, 'aiChatPage.exampleExplainThisQuestionCreateAStudyPlan')}
                    rows={1}
                    className="flex-1 min-w-0 min-h-[40px] max-h-40 resize-none bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus:shadow-none px-1 py-2.5 text-sm leading-5 placeholder:text-gray-400"
                  />

                  <button
                    type="submit"
                    disabled={sending || !prompt.trim()}
                    aria-label={translate(language, 'aiChatPage.send')}
                    className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
