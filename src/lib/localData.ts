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
    explanation_ja: 'TCPはOSIモデルのトランスポート層で信頼性のあるデータ転送を提供します。',
    explanation_en: 'TCP provides reliable data transmission at the Transport Layer of the OSI model.',
    explanation_vi: 'TCP cung cấp khả năng truyền dữ liệu đáng tin cậy ở tầng Vận chuyển của mô hình OSI.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'プロジェクトのスコープ、時間、コストの制約を何と呼ぶか？',
    choices: ['品質トライアングル', 'リスクマトリクス', 'プロジェクト憲章', '鉄の三角形'],
    answer: '鉄の三角形',
    explanation_ja: '鉄の三角形は、スコープ、時間、コストの3つの主要制約を表します。',
    explanation_en: 'The Iron Triangle represents the three major project constraints: scope, time, and cost.',
    explanation_vi: 'Tam giác sắt đại diện cho ba ràng buộc chính của dự án: phạm vi, thời gian và chi phí.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '強み、弱み、機会、脅威を評価するフレームワークは何か？',
    choices: ['SWOT分析', 'PEST分析', 'ファイブフォース分析', 'バリューチェーン分析'],
    answer: 'SWOT分析',
    explanation_ja: 'SWOT分析は内部要因と外部要因を整理し、戦略立案に使います。',
    explanation_en: 'SWOT analysis evaluates internal and external factors for strategic planning.',
    explanation_vi: 'Phân tích SWOT đánh giá các yếu tố bên trong và bên ngoài để xây dựng chiến lược.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '不正なSQL文を実行させる攻撃手法は何か？',
    choices: ['クロスサイトスクリプティング', 'SQLインジェクション', 'DoS攻撃', 'フィッシング'],
    answer: 'SQLインジェクション',
    explanation_ja: 'SQLインジェクションは入力値を悪用して不正なSQLを実行させる攻撃です。',
    explanation_en: 'SQL injection is an attack that exploits input values to execute unauthorized SQL commands.',
    explanation_vi: 'SQL Injection là kỹ thuật tấn công lợi dụng dữ liệu nhập vào để thực thi câu lệnh SQL trái phép.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: '作業を階層的に詳細化して管理可能な単位に分割した図を何と呼ぶか？',
    choices: ['ガントチャート', 'WBS', 'PERT図', 'アローダイアグラム'],
    answer: 'WBS',
    explanation_ja: 'WBSはプロジェクトの作業を階層的に分解して管理しやすくする手法です。',
    explanation_en: 'WBS is a method of breaking project work into hierarchical and manageable components.',
    explanation_vi: 'WBS là phương pháp phân chia công việc dự án thành các cấp độ nhỏ hơn để dễ quản lý.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'ドメイン名をIPアドレスに変換するサービスを提供するシステムは何か？',
    choices: ['DHCP', 'DNS', 'HTTP', 'SMTP'],
    answer: 'DNS',
    explanation_ja: 'DNSはドメイン名をIPアドレスに変換する役割を担っています。',
    explanation_en: 'DNS resolves domain names into IP addresses.',
    explanation_vi: 'DNS chuyển đổi tên miền thành địa chỉ IP.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '公開鍵と秘密鍵のペアを使用して暗号化と復号を行う暗号方式を何と呼ぶか？',
    choices: ['共通鍵暗号方式', '公開鍵暗号方式', 'ハッシュ関数', 'ブロックチェーン'],
    answer: '公開鍵暗号方式',
    explanation_ja: '公開鍵暗号方式は暗号化と復号に異なる鍵を使う非対称暗号です。',
    explanation_en: 'Public key cryptography uses different keys for encryption and decryption.',
    explanation_vi: 'Mã hóa khóa công khai sử dụng khóa khác nhau để mã hóa và giải mã.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'タスクの開始日、終了日、期間を視覚的に表現する棒グラフは何か？',
    choices: ['フローチャート', 'ヒストグラム', '散布図', 'ガントチャート'],
    answer: 'ガントチャート',
    explanation_ja: 'ガントチャートはプロジェクトの日程を視覚的に示します。',
    explanation_en: 'A Gantt chart visually shows project schedules.',
    explanation_vi: 'Biểu đồ Gantt thể hiện trực quan lịch trình dự án.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '市場成長率と市場占有率の2つの軸で事業を評価するフレームワークは何か？',
    choices: ['アンゾフの成長マトリクス', 'BCGマトリクス', 'SWOT分析', '3C分析'],
    answer: 'BCGマトリクス',
    explanation_ja: 'BCGマトリクスは事業を4象限に分類し資源配分を検討します。',
    explanation_en: 'The BCG Matrix classifies businesses into four quadrants for resource allocation.',
    explanation_vi: 'Ma trận BCG phân loại kinh doanh thành 4 nhóm để phân bổ nguồn lực.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'IPアドレスなどの必要な情報を自動的に割り当てるプロトコルは何か？',
    choices: ['FTP', 'SNMP', 'DHCP', 'DNS'],
    answer: 'DHCP',
    explanation_ja: 'DHCPはクライアントにIPアドレスを動的に割り当てます。',
    explanation_en: 'DHCP dynamically assigns IP addresses to clients.',
    explanation_vi: 'DHCP tự động cấp phát địa chỉ IP cho client.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '複数のハードディスクを組み合わせて信頼性や性能を向上させる技術は何か？',
    choices: ['SSD', 'RAID', 'NFS', 'SAN'],
    answer: 'RAID',
    explanation_ja: 'RAIDは複数ディスクを組み合わせ性能や耐障害性を高めます。',
    explanation_en: 'RAID combines multiple disks to improve performance and fault tolerance.',
    explanation_vi: 'RAID kết hợp nhiều đĩa để tăng hiệu năng và khả năng chịu lỗi.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'プロジェクト完了までの最短時間を特定する手法は何か？',
    choices: ['クリティカルパス法', 'モンテカルロ法', 'デルファイ法', 'ファンクションポイント法'],
    answer: 'クリティカルパス法',
    explanation_ja: 'クリティカルパス法は最も長い経路を特定し遅延を管理します。',
    explanation_en: 'The Critical Path Method identifies the longest task sequence to manage delays.',
    explanation_vi: 'Phương pháp đường găng xác định chuỗi công việc dài nhất để quản lý trễ hạn.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '顧客、競合、自社の3つの視点から事業環境を分析するフレームワークは何か？',
    choices: ['4P分析', '3C分析', 'ファイブフォース分析', 'PEST分析'],
    answer: '3C分析',
    explanation_ja: '3C分析は市場、競合、自社を総合的に分析する基本フレームワークです。',
    explanation_en: '3C analysis comprehensively examines market, competitors, and company.',
    explanation_vi: 'Phân tích 3C phân tích tổng hợp thị trường, đối thủ và doanh nghiệp.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '物理メモリの容量を超えるメモリ空間を実現する仕組みは何か？',
    choices: ['キャッシュメモリ', '仮想メモリ', 'レジスタ', 'フラッシュメモリ'],
    answer: '仮想メモリ',
    explanation_ja: '仮想メモリは補助記憶を利用し物理メモリ以上の空間を実現します。',
    explanation_en: 'Virtual memory uses secondary storage to exceed physical memory capacity.',
    explanation_vi: 'Bộ nhớ ảo sử dụng bộ nhớ phụ để vượt quá dung lượng bộ nhớ vật lý.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '内外の通信を監視・制御して不正なアクセスを防ぐシステムは何か？',
    choices: ['ルータ', 'スイッチ', 'ファイアウォール', 'IDS'],
    answer: 'ファイアウォール',
    explanation_ja: 'ファイアウォールはルールに基づき通信を許可・拒否します。',
    explanation_en: 'A firewall allows or blocks traffic based on security rules.',
    explanation_vi: 'Tường lửa cho phép hoặc chặn lưu lượng dựa trên quy tắc bảo mật.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'サービスの品質レベルについて合意した文書を何と呼ぶか？',
    choices: ['SLA', 'NDA', 'RFP', 'SOW'],
    answer: 'SLA',
    explanation_ja: 'SLAはサービスレベルの目標値を定義し期待値を明確にします。',
    explanation_en: 'An SLA defines service level targets and clarifies expectations.',
    explanation_vi: 'SLA xác định mục tiêu mức dịch vụ và làm rõ kỳ vọng.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '業界の収益性を決定する5つの競争要因を分析するフレームワークは何か？',
    choices: ['ポーターのファイブフォース分析', 'BCGマトリクス', 'SWOT分析', 'バリューチェーン分析'],
    answer: 'ポーターのファイブフォース分析',
    explanation_ja: 'ファイブフォース分析は業界の構造と競争の激しさを分析します。',
    explanation_en: 'Five Forces analysis examines industry structure and competitive intensity.',
    explanation_vi: 'Phân tích Năm áp lực xem xét cấu trúc ngành và mức độ cạnh tranh.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'CPUが次に実行するプロセスを選択するOSの機能を何と呼ぶか？',
    choices: ['メモリ管理', 'ファイル管理', 'プロセススケジューリング', 'デバイス管理'],
    answer: 'プロセススケジューリング',
    explanation_ja: 'プロセススケジューリングはCPU利用率とスループットを最適化します。',
    explanation_en: 'Process scheduling optimizes CPU utilization and throughput.',
    explanation_vi: 'Lập lịch tiến trình tối ưu hóa việc sử dụng CPU và thông lượng.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'データの冗長性を排除しテーブルを体系的に整理するプロセスを何と呼ぶか？',
    choices: ['インデックス作成', 'クエリ最適化', '正規化', 'トランザクション管理'],
    answer: '正規化',
    explanation_ja: '正規化はテーブルを整理し更新時の不整合を防ぎます。',
    explanation_en: 'Normalization organizes tables to prevent update anomalies.',
    explanation_vi: 'Chuẩn hóa tổ chức bảng dữ liệu để ngăn ngừa bất thường khi cập nhật.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'ITサービスマネジメントのベストプラクティスをまとめたフレームワークは何か？',
    choices: ['COBIT', 'PMBOK', 'ITIL', 'CMMI'],
    answer: 'ITIL',
    explanation_ja: 'ITILはITサービスの品質向上とビジネス整合を目的とします。',
    explanation_en: 'ITIL aims to improve IT service quality and align with business needs.',
    explanation_vi: 'ITIL nhằm nâng cao chất lượng dịch vụ CNTT và gắn kết với nhu cầu kinh doanh.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '競合のいない未開拓の市場を創造する経営戦略論を何と呼ぶか？',
    choices: ['ブルーオーシャン戦略', 'レッドオーシャン戦略', '多角化戦略', '集中戦略'],
    answer: 'ブルーオーシャン戦略',
    explanation_ja: 'ブルーオーシャン戦略は新しい価値を提供し競争のない市場を目指します。',
    explanation_en: 'Blue ocean strategy creates competition-free market space through new value.',
    explanation_vi: 'Chiến lược đại dương xanh tạo không gian thị trường không cạnh tranh qua giá trị mới.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'アドレス空間が128ビットに拡張された次世代インターネットプロトコルは何か？',
    choices: ['IPv5', 'IPv6', 'TCP/IP v2', 'IPX/SPX'],
    answer: 'IPv6',
    explanation_ja: 'IPv6はIPv4のアドレス枯渇問題を解決するために開発されました。',
    explanation_en: 'IPv6 was developed to solve the IPv4 address exhaustion problem.',
    explanation_vi: 'IPv6 được phát triển để giải quyết vấn đề cạn kiệt địa chỉ của IPv4.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'コンピュータがデータから学習しパターンを見つけ出す技術分野は何か？',
    choices: ['エキスパートシステム', 'ニューラルネットワーク', '機械学習', 'データマイニング'],
    answer: '機械学習',
    explanation_ja: '機械学習はAIの一分野で画像認識や自然言語処理に応用されます。',
    explanation_en: 'Machine learning is an AI field applied to image recognition and NLP.',
    explanation_vi: 'Học máy là lĩnh vực AI được ứng dụng trong nhận dạng hình ảnh và xử lý ngôn ngữ.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'スプリントと呼ばれる短期間のイテレーションを繰り返すアジャイル手法は何か？',
    choices: ['ウォーターフォール', 'スパイラルモデル', 'スクラム', 'エクストリームプログラミング'],
    answer: 'スクラム',
    explanation_ja: 'スクラムはデイリースクラムなどを通じて柔軟に開発を進めます。',
    explanation_en: 'Scrum flexibly proceeds with development through practices like Daily Scrum.',
    explanation_vi: 'Scrum tiến hành phát triển linh hoạt thông qua các hoạt động như Daily Scrum.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: '他社には真似のできない企業独自の中核的な能力を何と呼ぶか？',
    choices: ['コアコンピタンス', 'シナジー効果', '規模の経済', 'ブランドエクイティ'],
    answer: 'コアコンピタンス',
    explanation_ja: 'コアコンピタンス経営は得意分野に資源を集中し優位性を築きます。',
    explanation_en: 'Core competence management builds advantage by focusing on core strengths.',
    explanation_vi: 'Quản trị năng lực cốt lõi xây dựng lợi thế bằng cách tập trung vào thế mạnh.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'ハードウェアやネットワークなどのインフラを提供するクラウドサービス形態は何か？',
    choices: ['SaaS', 'PaaS', 'IaaS', 'DaaS'],
    answer: 'IaaS',
    explanation_ja: 'IaaSはサーバやストレージなどのITインフラを提供します。',
    explanation_en: 'IaaS provides IT infrastructure such as servers and storage.',
    explanation_vi: 'IaaS cung cấp hạ tầng CNTT như máy chủ và lưu trữ.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: 'ビッグデータの特徴を表す「3つのV」に含まれないものはどれか？',
    choices: ['Volume', 'Variety', 'Velocity', 'Value'],
    answer: 'Value',
    explanation_ja: '基本の3VはVolume、Velocity、Varietyで、Valueは後から加えられました。',
    explanation_en: 'The basic 3Vs are Volume, Velocity, and Variety; Value was added later.',
    explanation_vi: '3V cơ bản là Volume, Velocity và Variety; Value được thêm vào sau.',
    difficulty: 2,
  },

  {
    subject_id: SUBJECT_IDS.management,
    question_text: 'ビジネス目標とIT目標を整合させるガバナンスフレームワークは何か？',
    choices: ['ITIL', 'ISO/IEC 27001', 'COBIT', 'PMBOK'],
    answer: 'COBIT',
    explanation_ja: 'COBITはIT統制とガバナンスのための成熟したフレームワークです。',
    explanation_en: 'COBIT provides a mature framework for IT control and governance.',
    explanation_vi: 'COBIT cung cấp khung quản trị và kiểm soát CNTT trưởng thành.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.strategy,
    question_text: 'コスト、品質、サービス、スピードの劇的な改善を目指すアプローチは何か？',
    choices: ['TQM', 'シックスシグマ', 'BPR', 'カイゼン'],
    answer: 'BPR',
    explanation_ja: 'BPRは業務プロセスを情報技術で根本的に再設計する考え方です。',
    explanation_en: 'BPR fundamentally redesigns business processes using information technology.',
    explanation_vi: 'BPR tái thiết kế triệt để quy trình kinh doanh bằng công nghệ thông tin.',
    difficulty: 3,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '様々な「モノ」がインターネットに接続され情報をやり取りする仕組みは何か？',
    choices: ['AI', 'IoT', 'クラウドコンピューティング', 'ビッグデータ'],
    answer: 'IoT',
    explanation_ja: 'IoTはセンサー搭載の物体がインターネット経由でデータをやり取りします。',
    explanation_en: 'IoT enables sensor-equipped objects to exchange data over the internet.',
    explanation_vi: 'IoT cho phép các vật thể có cảm biến trao đổi dữ liệu qua internet.',
    difficulty: 1,
  },

  {
    subject_id: SUBJECT_IDS.technology,
    question_text: '取引記録を暗号技術で鎖のようにつなぎ分散管理する技術は何か？',
    choices: ['データマイニング', 'ブロックチェーン', 'ニューラルネットワーク', '公開鍵暗号'],
    answer: 'ブロックチェーン',
    explanation_ja: 'ブロックチェーンはP2P上で台帳を共有し合意形成でデータを保証します。',
    explanation_en: 'Blockchain shares a ledger on P2P networks and ensures data via consensus.',
    explanation_vi: 'Blockchain chia sẻ sổ cái trên mạng P2P và đảm bảo dữ liệu qua đồng thuận.',
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