import { Question, Subject } from '../types';
import { translate, type Language } from '../i18n';
import { isSupabaseEnabled, supabase } from './supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  language: Language;
  profileName?: string;
  subject?: Subject | null;
  recentQuestions: Question[];
  history: ChatTurn[];
}

function summarizeQuestions(questions: Question[], language: Language) {
  if (questions.length === 0) return translate(language, 'aiChat.noRecentQuestions');
  return questions
    .slice(0, 3)
    .map(q => translate(language, 'aiChat.questionSummary', {
      number: q.question_number,
      text: q.question_text,
    }))
    .join('\n');
}

function buildLocalAnswer(prompt: string, context: ChatContext) {
  const lower = prompt.toLowerCase();
  const isPlan = /計画|スケジュール|勉強|学習|plan|schedule|study|kế hoạch|lịch|học/.test(lower);
  const isDifficulty = /難しい|苦手|わからない|理解|difficult|weak|understand|khó|yếu|hiểu/.test(lower);
  const isQuestion = /問題|質問|わかりません|理解|explanation|explain/.test(lower);
  const subjectName = context.subject?.name ?? translate(context.language, 'aiChat.currentSubject');

  if (isPlan) {
    return `**${context.profileName ?? 'Your'} Study Plan for ${subjectName}**\n\n**Week 1-2: Foundation Building**\n- Review core concepts and terminology\n- Complete practice questions on fundamentals\n- Focus on understanding, not just memorizing\n\n**Week 3-4: Deepen Understanding**\n- Work through mid-level difficulty questions\n- Identify weak areas\n- Review those topics thoroughly\n\n**Week 5-6: Challenge & Refine**\n- Practice difficult questions\n- Take full-length practice exams\n- Analyze mistakes to identify patterns\n\n**Study Tips:**\n- Study 30-45 minutes daily rather than cramming\n- After each session, write down what you learned\n- Test yourself on the material\n- When stuck, break the question into smaller parts`;
  }

  if (isDifficulty || isQuestion) {
    return `**How to Tackle Difficult Questions**\n\n**Step 1: Rephrase the Question**\nIn one sentence, what is this question really asking? Ignoring the options, what concept needs to be understood?\n\n**Step 2: Recall Key Concepts**\nBefore looking at options, answer these:\n- What terms or concepts are involved?\n- What definitions or principles relate to this?\n- What did I study about this topic?\n\n**Step 3: Eliminate Choices Strategically**\n- Identify options that are definitely wrong\n- Be aware of common misconceptions\n- If unsure, reason through each option\n\n**Step 4: Verify Your Answer**\nWhy is your answer correct? Can you explain it in your own words?\n\n**When Completely Stuck:**\nUse process of elimination, but don't stop there - after the test, study why the correct answer is right.\n\n**Practice Strategy:**\n- Spend 2-3 minutes understanding the question before choosing\n- Review explanations for both correct AND incorrect answers\n- Group similar questions and study them together`;
  }

  if (/午後|アルゴリズム|ネットワーク|セキュリティ|afternoon|algorithm|network|security|buổi chiều|thuật toán|mạng|bảo mật/.test(lower)) {
    return `**Afternoon Session Strategy for ${subjectName}**\n\n**Common Afternoon Topics:**\n- Algorithms and data structures\n- Network security\n- Systems design\n- Database concepts\n\n**Study Approach:**\n1. **Understand Principles First** - Don't memorize flow charts, understand why they work\n2. **Draw Diagrams** - Visual representation helps with complex concepts\n3. **Trace Through Examples** - Walk through step-by-step with concrete examples\n4. **Practice Code-Like Problems** - Even if not coding, logical thinking is key\n\n**For Algorithm Questions:**\n- Trace through with sample inputs\n- Identify the time/space complexity\n- Know common algorithms\n\n**For Security Questions:**\n- Understand threats and vulnerabilities\n- Know mitigation strategies\n- Recognize real-world applications`;
  }

  return `**Welcome! How can I help you study for the IT Passport exam?**\n\nYou can ask me about:\n\n**📚 Study Planning**\n- "How should I study..."\n- "What's the best way to..."\n- "How do I prepare for..."\n\n**🤔 Difficult Concepts**\n- "I don't understand..."\n- "Can you explain..."\n- "What's the difference between..."\n\n**⚡ Problem-Solving**\n- "How do I approach this type of question..."\n- "Why is the answer..."\n- "Can you break down this topic..."\n\n**💡 Specific Topics**\n- Ask about any concept in ${subjectName}\n- Request explanation of terminology\n- Get tips for difficult sections\n\n**How I'll Help:**\n1. Explain concepts in clear, simple language\n2. Break complex topics into steps\n3. Give you strategies for solving problems\n4. Suggest study methods that work\n\nWhat would you like help with today?`;
}

function buildSystemPrompt(context: ChatContext) {
  const subjectName = context.subject?.name ?? translate(context.language, 'aiChat.currentSubject');
  const recentQuestions = summarizeQuestions(context.recentQuestions, context.language);

  const languageNames: Record<Language, string> = {
    ja: 'Japanese',
    en: 'English',
    vi: 'Vietnamese',
  };

  return [
    translate(context.language, 'aiChat.systemRole'),
    translate(context.language, 'aiChat.systemLanguage'),
    `You must respond in ${languageNames[context.language]} only. Do not use any other language.`,
    translate(context.language, 'aiChat.systemStructure'),
    translate(context.language, 'aiChat.systemAudience'),
    translate(context.language, 'aiChat.systemSubject', { subject: subjectName }),
    translate(context.language, 'aiChat.systemLearner', { name: context.profileName ?? translate(context.language, 'common.you') }),
    translate(context.language, 'aiChat.systemRecentQuestions', { questions: recentQuestions }),
  ].join('\n');
}

async function tryRemoteAnswer(prompt: string, context: ChatContext) {
  if (!isSupabaseEnabled) {
    console.log('[AI] Supabase not enabled, using local fallback');
    return null;
  }

  const systemPrompt = buildSystemPrompt(context);
  const userMessages = context.history.slice(-12).map(turn => ({ role: turn.role, content: turn.content }));

  console.log('[AI] Attempting remote answer with Supabase function...');
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { prompt, messages: userMessages, systemPrompt },
    });

    if (error) {
      console.error('[AI] Supabase function error:', error);
      return null;
    }
    
    if (!data || typeof data !== 'object' || !('reply' in data)) {
      console.error('[AI] Invalid response format from Supabase:', data);
      return null;
    }
    
    const reply = (data as { reply?: unknown }).reply;
    if (typeof reply === 'string' && reply.trim()) {
      console.log('[AI] Got valid reply from Supabase function');
      return reply.trim();
    }
    console.log('[AI] Empty reply from Supabase');
    return null;
  } catch (err) {
    console.error('[AI] Supabase function invocation failed:', err);
    return null;
  }
}

export async function getChatReply(prompt: string, context: ChatContext) {
  try {
    const remote = await tryRemoteAnswer(prompt, context);
    if (remote) return remote;
  } catch (err) {
    console.error('[AI] Remote call failed, falling back:', err);
  }

  return buildLocalAnswer(prompt, context);
}

export async function getQuestionExplanation(
  questionText: string,
  options: string[],
  userAnswerIndex: number,
  correctAnswerIndex: number,
  language: Language,
  profileName?: string
) {
  const languageNames: Record<Language, string> = {
    ja: 'Japanese',
    en: 'English',
    vi: 'Vietnamese',
  };

  const systemPrompt = `You are an expert educator specializing in IT Passport exam preparation. Your role is to help students understand why they got a question wrong and how to approach similar questions in the future.

IMPORTANT: You must respond in ${languageNames[language]} only. Do not use any other language.

When explaining a question:
1. Acknowledge their attempt with respect
2. Clarify what the question is really asking
3. Explain the key concepts related to the question
4. Explain why the correct answer is right
5. Explain why their chosen answer was incorrect
6. Provide a learning tip for similar questions

Be concise but thorough. Use simple language. ${profileName ? `Help ${profileName} understand better.` : ''}`;

  const userPrompt = `Here's a question from the IT Passport exam:

Question: ${questionText}

Options:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}

I chose: ${String.fromCharCode(65 + userAnswerIndex)}
Correct answer: ${String.fromCharCode(65 + correctAnswerIndex)}

Please explain why the correct answer is right and help me understand this concept better.`;

  if (!isSupabaseEnabled) {
    return buildLocalQuestionExplanation(questionText, userAnswerIndex, correctAnswerIndex, language);
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { 
        prompt: userPrompt, 
        messages: [],
        systemPrompt 
      },
    });

    if (!error && data && typeof data === 'object' && 'reply' in data) {
      const reply = (data as { reply?: unknown }).reply;
      if (typeof reply === 'string' && reply.trim()) {
        return reply.trim();
      }
    }
  } catch (err) {
    // Silently fall back to local explanation
  }

  return buildLocalQuestionExplanation(questionText, userAnswerIndex, correctAnswerIndex, language);
}

function buildLocalQuestionExplanation(questionText: string, userAnswerIndex: number, correctAnswerIndex: number, language: Language): string {
  const userAnswerLabel = String.fromCharCode(65 + userAnswerIndex);
  const correctAnswerLabel = String.fromCharCode(65 + correctAnswerIndex);
  
  if (language === 'ja') {
    return `**問題を段階的に分解してみましょう**

**ステップ1: 何が問われているか？**
この問題を解くカギは、何が問われているかを正確に理解することです。問題を一文で言い換えてみてください。

**ステップ2: キーワードを思い出す**
選択肢を見る前に、以下のことを思い出してください:
- 問題に含まれる各キーワードは何を意味するか？
- このトピックに関連する概念は何か？
- この分野について何を学んだか？

**あなたの回答 vs 正解:**
- あなたの選択: **${userAnswerLabel}**
- 正解: **${correctAnswerLabel}**

**${correctAnswerLabel}が正解である理由:**
選択肢${correctAnswerLabel}はテストされている主要な概念に直接対応しています。問題が求めている定義や原理を正確に反映しています。

**${userAnswerLabel}が間違っていた理由:**
選択肢${userAnswerLabel}は一見もっともらしく見えるかもしれませんが、以下のいずれかに当たります:
- 問題が求めている特定のポイントを見落としている
- このトピックについての一般的な誤解を反映している
- 関連しているが異なる概念に対応している

**💡 同様の問題に対する学習戦略:**
1. 常に問われていることを一文で明確にしてから始める
2. 選択肢を見る前にこのトピックについて知っていることを考える
3. 消去法を最後の手段として使う
4. 丸暗記ではなく理解に焦点を当てる

**次回:**
同様の問題に出会ったときは、この概念と${correctAnswerLabel}が正解である理由を思い出してください。`;
  }
  
  if (language === 'vi') {
    return `**Phân tích Câu Hỏi Từng Bước**

**Bước 1: Câu Hỏi Yêu Cầu Gì?**
Chìa khóa để giải quyết câu hỏi này là hiểu chính xác những gì được hỏi. Phát biểu lại câu hỏi bằng một câu đơn giản.

**Bước 2: Nhớ Lại Các Khái Niệm Chính**
Trước khi xem các lựa chọn, hãy cố gắng nhớ lại:
- Mỗi từ khóa trong câu hỏi có ý nghĩa gì?
- Những khái niệm nào liên quan đến chủ đề này?
- Bạn đã học gì về điều này?

**Câu Trả Lời Của Bạn vs Câu Trả Lời Đúng:**
- Bạn chọn: **${userAnswerLabel}**
- Câu trả lời đúng: **${correctAnswerLabel}**

**Tại Sao ${correctAnswerLabel} Là Đúng:**
Lựa chọn ${correctAnswerLabel} trực tiếp đề cập đến khái niệm chính đang được kiểm tra. Nó phản ánh chính xác định nghĩa hoặc nguyên tắc mà câu hỏi đang yêu cầu.

**Tại Sao ${userAnswerLabel} Không Đúng:**
Lựa chọn ${userAnswerLabel} có vẻ hợp lý, nhưng nó có thể:
- Bỏ lỡ điểm cụ thể mà câu hỏi yêu cầu
- Đại diện cho một quan niệm sai lầm phổ biến về chủ đề này
- Giải quyết một khái niệm liên quan nhưng khác

**💡 Chiến Lược Học Tập Cho Các Câu Hỏi Tương Tự:**
1. Luôn làm rõ những gì được hỏi bằng một câu trước
2. Hãy suy nghĩ về những gì bạn biết về chủ đề TRƯỚC khi xem các lựa chọn
3. Sử dụng phương pháp loại trừ như là phương tiện cuối cùng
4. Tập trung vào sự hiểu biết, không phải chỉ ghi nhớ câu trả lời

**Lần Tới:**
Khi bạn gặp một câu hỏi tương tự, hãy nhớ lại khái niệm này và lý do tại sao ${correctAnswerLabel} là câu trả lời đúng.`;
  }
  
  // English (default)
  return `**Break Down This Question Step-by-Step:**

**Step 1: What's Being Asked?**
The key to solving this question is understanding exactly what it's asking. Rephrase the question in one simple sentence focusing on the core concept.

**Step 2: Recall Key Terms**
Before looking at the options, try to recall:
- What does each key term in the question mean?
- What concepts relate to this topic?
- What did you study about this?

**Your Answer vs. Correct Answer:**
- You chose: **${userAnswerLabel}**
- Correct answer: **${correctAnswerLabel}**

**Why ${correctAnswerLabel} is Correct:**
Option ${correctAnswerLabel} directly addresses the main concept being tested. It accurately reflects the definition or principle the question is asking about.

**Why ${userAnswerLabel} Wasn't Right:**
Option ${userAnswerLabel} might seem plausible, but it either:
- Misses the specific point the question is asking for
- Represents a common misconception in this topic
- Addresses a related but different concept

**💡 Learning Strategy for Similar Questions:**
1. Always clarify what's being asked in one sentence first
2. Think of what you know about the topic BEFORE looking at options
3. Use elimination method as a last resort, not first
4. Focus on understanding, not just memorizing answers

**Next Time:**
When you encounter a similar question, remember this concept and the reasoning behind why ${correctAnswerLabel} was correct.`;
}
