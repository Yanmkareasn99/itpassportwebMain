import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scan_exam import find_starts, OcrLine, parse_answers, parse_choices, subject_id


class ScannerParsingTests(unittest.TestCase):
    def test_choices_on_same_or_separate_lines(self):
        text, choices = parse_choices("問1 適切なものはどれか。\nア 選択肢A イ 選択肢B\nウ 選択肢C\nエ 選択肢D", 1)
        self.assertEqual(text, "適切なものはどれか。")
        self.assertEqual(choices["イ"], "選択肢B")
        self.assertEqual(len(choices), 4)

    def test_answers_accept_full_width_numbers(self):
        self.assertEqual(parse_answers("問１ ア 問 2 イ ８０ エ", 80), {1: "ア", 2: "イ", 80: "エ"})

    def test_answers_accept_grid_rows(self):
        self.assertEqual(parse_answers("問番号 1 2 3 4\n正解 ア イ ウ エ", 80), {1: "ア", 2: "イ", 3: "ウ", 4: "エ"})

    def test_starts_preserve_missing_number(self):
        lines = [[OcrLine("問1 本文", 10, 20), OcrLine("問3 本文", 30, 40)]]
        self.assertEqual([item.number for item in find_starts(lines, 100)], [1, 3])

    def test_ap_subject(self):
        self.assertEqual(subject_id("ap", 80), "ab000000-0000-0000-0000-000000000001")


if __name__ == "__main__":
    unittest.main()
