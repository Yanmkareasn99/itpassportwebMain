import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scan_exam import (
    find_starts,
    horizontal_choice_row,
    clean_detected_text,
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

    def test_answers_accept_full_width_numbers(self):
        self.assertEqual(parse_answers("問１ ア 問 2 イ ８０ エ", 80), {1: "ア", 2: "イ", 80: "エ"})

    def test_answers_accept_grid_rows(self):
        self.assertEqual(parse_answers("問番号 1 2 3 4\n正解 ア イ ウ エ", 80), {1: "ア", 2: "イ", 3: "ウ", 4: "エ"})

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

    def test_starts_preserve_missing_number(self):
        lines = [[OcrLine("問1 本文", 10, 20), OcrLine("問3 本文", 30, 40)]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1, 3])

    def test_starts_recover_one_missing_heading_in_complete_booklet(self):
        lines = [[
            OcrLine("問1 本文", 10, 20),
            OcrLine("問2 本文", 30, 40),
            OcrLine("問4 本文", 70, 80),
        ]]
        starts = find_starts(lines, 4)
        self.assertEqual([item.number for item in starts], [1, 2, 3, 4])
        self.assertEqual(starts[2].top, 50)

    def test_starts_recover_when_expected_heading_repeats_next_number(self):
        lines = [[
            OcrLine("問1 本文", 10, 20),
            OcrLine("問3 二問目を三と誤認", 30, 40),
            OcrLine("問3 本文", 50, 60),
        ]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1, 2, 3])

    def test_starts_correct_common_ocr_number_errors_and_separators(self):
        lines = [[
            *[OcrLine(f"問{number} 本文", number * 10, number * 10 + 5) for number in range(1, 10)],
            OcrLine("問19_ 十問目", 100, 105),
            OcrLine("問11 本文", 110, 115),
        ]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], list(range(1, 12)))

    def test_complete_booklet_uses_physical_heading_order(self):
        lines = [[
            OcrLine("問1 本文", 10, 20),
            OcrLine("問9 二問目を九と誤認", 30, 40),
            OcrLine("問3 本文", 50, 60),
        ]]
        self.assertEqual([item.number for item in find_starts(lines, 3)], [1, 2, 3])

    def test_starts_ignore_subject_range_headers(self):
        lines = [[
            OcrLine("問1から問35まではストラテジ系の問題です。", 10, 20),
            OcrLine("問1 本文", 30, 40),
        ]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1])

    def test_ap_subject(self):
        self.assertEqual(subject_id("ap", 80), "ab000000-0000-0000-0000-000000000001")


if __name__ == "__main__":
    unittest.main()
