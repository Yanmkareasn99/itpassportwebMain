import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scan_exam import (
    clean_detected_text,
    horizontal_choice_row,
    detect_choice_regions,
    VISUAL_KEYWORD_RE,
    find_starts,
    OcrLine,
    OcrWord,
    parse_answers,
    parse_choices,
    subject_id,
)


class ScannerParsingTests(unittest.TestCase):
    def test_cleans_spaces_inside_japanese_without_merging_latin_markers(self):
        self.assertEqual(
            clean_detected_text("著作 権 に 関する 記述 a ～ c のうち、 適切 なもの"),
            "著作権に関する記述 a ～ c のうち、適切なもの",
        )

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

    def test_horizontal_choices_use_physical_columns(self):
        words = [
            OcrWord("b", 40, 100, 10, 15),
            OcrWord("本文の続き", 60, 100, 120, 15),
            OcrWord("ア", 50, 200, 18, 20),
            OcrWord("a,", 78, 200, 22, 20),
            OcrWord("b", 105, 200, 12, 20),
            OcrWord("イ", 200, 202, 18, 20),
            OcrWord("b", 230, 202, 12, 20),
            OcrWord("ウ", 350, 199, 18, 20),
            OcrWord("b,", 380, 199, 22, 20),
            OcrWord("c", 407, 199, 12, 20),
            OcrWord("エ", 500, 201, 18, 20),
            OcrWord("c", 530, 201, 12, 20),
        ]
        result = horizontal_choice_row(words, 650)
        self.assertIsNotNone(result)
        choice_top, choices = result
        self.assertGreater(choice_top, 180)
        self.assertEqual(choices, {"ア": "a, b", "イ": "b", "ウ": "b, c", "エ": "c"})

    def test_non_aligned_labels_fall_back_to_text_parser(self):
        words = [
            OcrWord("ア", 50, 100, 18, 20),
            OcrWord("イ", 50, 160, 18, 20),
            OcrWord("ウ", 50, 220, 18, 20),
            OcrWord("エ", 50, 280, 18, 20),
        ]
        self.assertIsNone(horizontal_choice_row(words, 650))

    def test_detects_vertical_choice_image_rows(self):
        words = [
            OcrWord("ア", 20, 200, 20, 20),
            OcrWord("イ", 22, 300, 20, 20),
            OcrWord("ウ", 19, 400, 20, 20),
            OcrWord("工", 21, 500, 20, 20),
        ]
        regions = detect_choice_regions(words, 900, 700)
        self.assertEqual(set(regions), set("アイウエ"))
        self.assertLess(regions["ア"][1], regions["イ"][1])

    def test_rejects_ambiguous_choice_image_geometry(self):
        words = [
            OcrWord("ア", 10, 10, 10, 10),
            OcrWord("イ", 300, 80, 10, 10),
            OcrWord("ウ", 50, 150, 10, 10),
            OcrWord("エ", 500, 240, 10, 10),
        ]
        self.assertEqual(detect_choice_regions(words, 800, 600), {})

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
