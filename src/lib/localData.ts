import { AnswerChoice, Question, Subject } from '../types';

const SUBJECT_IDS = {
  strategy: 'cc000001-0000-0000-0000-000000000001',
  management: 'cc000002-0000-0000-0000-000000000001',
  technology: 'cc000003-0000-0000-0000-000000000001',
};

export const localSubjects: Subject[] = [
  {
    id: SUBJECT_IDS.strategy,
    name: 'ストラテジ系',
    description: 'Business strategy, legal affairs, and management strategy basics.',
    color: '#3B82F6',
    created_at: new Date().toISOString(),
  },
  {
    id: SUBJECT_IDS.management,
    name: 'マネジメント系',
    description: 'Project management and service management basics.',
    color: '#10B981',
    created_at: new Date().toISOString(),
  },
  {
    id: SUBJECT_IDS.technology,
    name: 'テクノロジ系',
    description: 'Computer systems, networks, security, and development basics.',
    color: '#F59E0B',
    created_at: new Date().toISOString(),
  },
];


interface SeedQuestion {
  subject_id: string;
  question_text: string;
  choices: string[];
  answer: string;
  explanation_ja: string;
  explanation_en: string;
  explanation_vi: string;
  difficulty: number;
}


const seedQuestions: SeedQuestion[] = [
  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'OSI基本参照モデルのトランスポート層で動作するプロトコルはどれか？',
    choices: ['IP', 'HTTP', 'TCP', 'Ethernet'],
    answer: 'TCP',

    explanation_ja:
      'TCPはOSIモデルのトランスポート層で信頼性のあるデータ転送を提供します。',

    explanation_en:
      'TCP provides reliable data transmission at the Transport Layer of the OSI model.',

    explanation_vi:
      'TCP cung cấp khả năng truyền dữ liệu đáng tin cậy ở tầng Vận chuyển của mô hình OSI.',

    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'プロジェクトのスコープ、時間、コストの制約を何と呼ぶか？',
    choices: ['品質トライアングル', 'リスクマトリクス', 'プロジェクト憲章', '鉄の三角形'],
    answer: '鉄の三角形',

    explanation_ja:
      '鉄の三角形は、スコープ、時間、コストの3つの主要制約を表します。',

    explanation_en:
      'The Iron Triangle represents the three major project constraints: scope, time, and cost.',

    explanation_vi:
      'Tam giác sắt đại diện cho ba ràng buộc chính của dự án: phạm vi, thời gian và chi phí.',

    difficulty: 2,
  },


  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '強み、弱み、機会、脅威を評価するフレームワークは何か？',
    choices: ['SWOT分析', 'PEST分析', 'ファイブフォース分析', 'バリューチェーン分析'],
    answer: 'SWOT分析',

    explanation_ja:
      'SWOT分析は内部要因と外部要因を整理し、戦略立案に使います。',

    explanation_en:
      'SWOT analysis evaluates internal and external factors for strategic planning.',

    explanation_vi:
      'Phân tích SWOT đánh giá các yếu tố bên trong và bên ngoài để xây dựng chiến lược.',

    difficulty: 1,
  },


  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '不正なSQL文を実行させる攻撃手法は何か？',
    choices: ['クロスサイトスクリプティング', 'SQLインジェクション', 'DoS攻撃', 'フィッシング'],
    answer: 'SQLインジェクション',

    explanation_ja:
      'SQLインジェクションは入力値を悪用して不正なSQLを実行させる攻撃です。',

    explanation_en:
      'SQL injection is an attack that exploits input values to execute unauthorized SQL commands.',

    explanation_vi:
      'SQL Injection là kỹ thuật tấn công lợi dụng dữ liệu nhập vào để thực thi câu lệnh SQL trái phép.',

    difficulty: 3,
  },


  {
    subject_id: SUBJECT_IDS.management,
    question_text: '作業を階層的に詳細化して管理可能な単位に分割した図を何と呼ぶか？',
    choices: ['ガントチャート', 'WBS', 'PERT図', 'アローダイアグラム'],
    answer: 'WBS',

    explanation_ja:
      'WBSはプロジェクトの作業を階層的に分解して管理しやすくする手法です。',

    explanation_en:
      'WBS is a method of breaking project work into hierarchical and manageable components.',

    explanation_vi:
      'WBS là phương pháp phân chia công việc dự án thành các cấp độ nhỏ hơn để dễ quản lý.',

    difficulty: 2,
  },
];

export const localQuestions: Question[] = seedQuestions.map((q, qIndex) => {
  const id = `local-question-${qIndex + 1}`;

  const answer_choices: AnswerChoice[] = q.choices.map(
    (choice, choiceIndex) => ({
      id: `${id}-choice-${choiceIndex + 1}`,
      question_id: id,
      choice_text: choice,
      is_correct: choice === q.answer,
      sort_order: choiceIndex + 1,
    })
  );

  return {
    id,
    subject_id: q.subject_id,
    question_number: qIndex + 1,

    question_text: q.question_text,
    question_type: 'multiple_choice',

    image_url: null,

    explanation: q.explanation_ja,

    explanation_ja: q.explanation_ja,
    explanation_en: q.explanation_en,
    explanation_vi: q.explanation_vi,

    difficulty: q.difficulty,
    points: 1,

    answer_choices,
  };
});


export function getLocalRows(table: string) {
  if (table === 'subjects') {
    return localSubjects;
  }

  if (table === 'questions') {
    return localQuestions;
  }

  return [];
}