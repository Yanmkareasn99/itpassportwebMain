import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scan_exam import (
    VISUAL_KEYWORD_RE,
    find_starts,
    OcrLine,
    parse_answers,
    parse_choices,
    subject_id,
)


class ScannerParsingTests(unittest.TestCase):
    def test_choices_on_same_or_separate_lines(self):
        text, choices = parse_choices("問1 適切なものはどれか。\nア 選択肢A イ 選択肢B\nウ 選択肢C\nエ 選択肢D", 1)
        self.assertEqual(text, "適切なものはどれか。")
        self.assertEqual(choices["イ"], "選択肢B")
        self.assertEqual(len(choices), 4)

    def test_choices_accept_kanji_confusable_for_e(self):
        # 工 (kanji) is visually near-identical to エ (katakana) and is a
        # common Tesseract misread for the 4th choice marker.
        text, choices = parse_choices(
            "PDCAサイクルのPが表すものはどれか。\nア Plan\nイ Process\nウ Product 工 Program",
            3,
        )
        self.assertEqual(choices["エ"], "Program")
        self.assertEqual(choices["ウ"], "Product")
        self.assertEqual(len(choices), 4)

    def test_choices_collapse_doubled_marker_artifact(self):
        # Tesseract sometimes doubles an isolated marker glyph ("エエ").
        text, choices = parse_choices(
            "クラウドサービスの特徴として適切なものはどれか。\n"
            "ア インターネット経由でサービスを利用できる\n"
            "イ 必ず自社内だけで利用する\n"
            "ウ ネットワークを使用しない エエ 全てのデータを和紙で管理する",
            2,
        )
        self.assertEqual(choices["エ"], "全てのデータを和紙で管理する")
        self.assertEqual(choices["ウ"], "ネットワークを使用しない")
        self.assertEqual(len(choices), 4)

    def test_answers_accept_full_width_numbers(self):
        answers, warnings = parse_answers("問１ ア 問 2 イ ８０ エ", 80)
        self.assertEqual(answers, {1: "ア", 2: "イ", 80: "エ"})
        self.assertEqual(warnings, [])

    def test_answers_accept_grid_rows(self):
        answers, warnings = parse_answers("問番号 1 2 3 4\n正解 ア イ ウ エ", 80)
        self.assertEqual(answers, {1: "ア", 2: "イ", 3: "ウ", 4: "エ"})
        self.assertEqual(warnings, [])

    def test_starts_preserve_missing_number(self):
        lines = [[OcrLine("問1 本文", 10, 20), OcrLine("問3 本文", 30, 40)]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1, 3])

    def test_starts_reject_large_low_confidence_jump(self):
        # A big jump (e.g. 1 -> 50) on a low-confidence heading is more
        # likely a stray OCR false positive than a genuine run of missed
        # questions, so it should not be accepted as the next start.
        lines = [
            [
                OcrLine("問1 本文", 10, 20, confidence=90.0),
                OcrLine("問50 本文", 30, 40, confidence=10.0),
            ]
        ]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1])

    def test_starts_accept_large_high_confidence_jump(self):
        # The same large jump is accepted when the heading detection is
        # confident, since there is no better candidate for question 2-49.
        lines = [
            [
                OcrLine("問1 本文", 10, 20, confidence=90.0),
                OcrLine("問50 本文", 30, 40, confidence=90.0),
            ]
        ]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1, 50])

    def test_ap_subject(self):
        self.assertEqual(subject_id("ap", 80), "ab000000-0000-0000-0000-000000000001")

    def test_visual_keyword_covers_common_diagram_phrasing(self):
        for phrase in (
            "次の図を見て答えよ",
            "棒グラフとして適切なものはどれか",
            "ガントチャートを用いて",
            "ヒストグラムから読み取れるものはどれか",
            "損益計算書に記載される",
            "真理値表として正しいものはどれか",
        ):
            self.assertTrue(
                VISUAL_KEYWORD_RE.search(phrase), f"missed: {phrase}"
            )
        self.assertIsNone(
            VISUAL_KEYWORD_RE.search("一般的な文章にはヒットしないはず")
        )


if __name__ == "__main__":
    unittest.main()