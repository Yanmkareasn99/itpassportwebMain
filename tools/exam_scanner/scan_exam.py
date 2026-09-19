#!/usr/bin/env python3
"""Convert IPA IT Passport/AP question and answer PDFs to a Manabi archive."""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

AP_SUBJECT_ID = "ab000000-0000-0000-0000-000000000001"
IP_SUBJECT_IDS = {
    "strategy": "cc000001-0000-0000-0000-000000000001",
    "management": "cc000002-0000-0000-0000-000000000001",
    "technology": "cc000003-0000-0000-0000-000000000001",
}
LABELS = "アイウエ"
HEADING_RE = re.compile(r"^[問間]\s*([0-9０-９]{1,3})(?=\s|[^0-9０-９])")
ANSWER_PAIR_RE = re.compile(r"(?:問\s*)?([0-9０-９]{1,3})\s*([アイウエ])")


@dataclass(frozen=True)
class OcrLine:
    text: str
    top: int
    bottom: int


@dataclass(frozen=True)
class OcrWord:
    text: str
    left: int
    top: int
    width: int
    height: int

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def center_y(self) -> float:
        return self.top + self.height / 2


@dataclass(frozen=True)
class QuestionStart:
    number: int
    page_index: int
    top: int


def normalize(text: str) -> str:
    table = str.maketrans("０１２３４５６７８９，．", "0123456789,.")
    return re.sub(r"[ \t]+", " ", text.translate(table)).strip()


def clean_detected_text(text: str) -> str:
    japanese = r"\u3040-\u30ff\u3400-\u9fff"
    text = re.sub(rf"(?<=[{japanese}]) +(?=[{japanese}])", "", text)
    text = re.sub(r" +([、。）」』】])", r"\1", text)
    text = re.sub(rf"([、。]) +(?=[{japanese}])", r"\1", text)
    return re.sub(r"([（「『【]) +", r"\1", text).strip()


def parse_choices(raw_text: str, number: int) -> tuple[str, dict[str, str]]:
    lines = [normalize(line) for line in raw_text.splitlines() if normalize(line)]
    if lines:
        lines[0] = re.sub(rf"^[問間]\s*{number}\s*[、。：:.]?\s*", "", lines[0])
    body: list[str] = []
    choices: dict[str, list[str]] = {}
    current: str | None = None
    marker = re.compile(r"(?:^|\s)([アイウエ])(?=\s|[^\u30a0-\u30ff])")
    for line in lines:
        matches = list(marker.finditer(line))
        if not matches:
            (choices[current] if current else body).append(line)
            continue
        prefix = line[: matches[0].start()].strip()
        if prefix:
            (choices[current] if current else body).append(prefix)
        for index, match in enumerate(matches):
            current = match.group(1)
            choices.setdefault(current, [])
            end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
            value = line[match.end() : end].strip()
            if value:
                choices[current].append(value)
    return clean_detected_text("\n".join(body)), {
        label: clean_detected_text(" ".join(parts))
        for label, parts in choices.items() if " ".join(parts).strip()
    }


def parse_answers(text: str, maximum: int) -> dict[int, str]:
    answers: dict[int, str] = {}
    lines = [normalize(line) for line in text.splitlines() if normalize(line)]
    for match in ANSWER_PAIR_RE.finditer(" ".join(lines)):
        number = int(normalize(match.group(1)))
        if 1 <= number <= maximum:
            answers[number] = match.group(2)
    for index, line in enumerate(lines):
        numbers = [int(value) for value in re.findall(r"(?:問\s*)?([0-9]{1,3})", line)]
        numbers = [number for number in numbers if 1 <= number <= maximum]
        if len(numbers) < 2:
            continue
        for candidate in lines[index + 1 : index + 4]:
            labels = re.findall(r"[アイウエ]", candidate)
            if len(labels) == len(numbers):
                for number, label in zip(numbers, labels):
                    answers.setdefault(number, label)
                break
    return answers


def subject_id(exam: str, number: int) -> str:
    if exam == "ap":
        return AP_SUBJECT_ID
    if number <= 35:
        return IP_SUBJECT_IDS["strategy"]
    if number <= 55:
        return IP_SUBJECT_IDS["management"]
    return IP_SUBJECT_IDS["technology"]


def load_runtime():
    try:
        import fitz
        import pytesseract
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    except ImportError as error:
        raise SystemExit(
            "Missing scanner dependencies. Run: pip install -r tools/exam_scanner/requirements.txt"
        ) from error
    return fitz, pytesseract, Image, ImageEnhance, ImageFilter, ImageOps


def render_pages(pdf_path: Path, dpi: int):
    fitz, _, Image, _, _, _ = load_runtime()
    document = fitz.open(pdf_path)
    scale = dpi / 72
    pages = []
    try:
        for page in document:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
            pages.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
    finally:
        document.close()
    return pages


def prepare_image(image):
    _, _, _, ImageEnhance, ImageFilter, ImageOps = load_runtime()
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    return gray.filter(ImageFilter.SHARPEN)


def ocr_lines(image, lang: str, psm: int = 6) -> list[OcrLine]:
    _, pytesseract, _, _, _, _ = load_runtime()
    data = pytesseract.image_to_data(
        prepare_image(image), lang=lang, config=f"--oem 1 --psm {psm}", output_type=pytesseract.Output.DICT
    )
    grouped: dict[tuple[int, int, int], list[tuple[int, str, int, int]]] = {}
    for index, text in enumerate(data["text"]):
        text = normalize(text)
        if not text:
            continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        top = int(data["top"][index])
        grouped.setdefault(key, []).append((int(data["left"][index]), text, top, top + int(data["height"][index])))
    result = []
    for words in grouped.values():
        words.sort()
        result.append(OcrLine(" ".join(word[1] for word in words), min(word[2] for word in words), max(word[3] for word in words)))
    return sorted(result, key=lambda line: (line.top, line.bottom))


def ocr_words(image, lang: str, psm: int = 6) -> list[OcrWord]:
    _, pytesseract, _, _, _, _ = load_runtime()
    data = pytesseract.image_to_data(
        prepare_image(image), lang=lang, config=f"--oem 1 --psm {psm}", output_type=pytesseract.Output.DICT
    )
    words = []
    for index, value in enumerate(data["text"]):
        text = normalize(value)
        if not text:
            continue
        words.append(OcrWord(
            text=text,
            left=int(data["left"][index]),
            top=int(data["top"][index]),
            width=int(data["width"][index]),
            height=int(data["height"][index]),
        ))
    return words


def horizontal_choice_row(words: list[OcrWord], image_width: int) -> tuple[int, dict[str, str]] | None:
    """Read an IPA-style horizontal ア–エ choice row by physical columns.

    Tesseract's reading order is unreliable when four short choices share one
    row. Coordinates are stable, so detect the aligned labels and assign text
    to the column immediately to the right of each label.
    """
    label_words = [word for word in words if word.text in LABELS]
    if len(label_words) < len(LABELS):
        return None

    for anchor in sorted(label_words, key=lambda word: (word.top, word.left), reverse=True):
        tolerance = max(18, anchor.height * 2)
        aligned = [word for word in label_words if abs(word.center_y - anchor.center_y) <= tolerance]
        by_label: dict[str, OcrWord] = {}
        for label in LABELS:
            candidates = [word for word in aligned if word.text == label]
            if candidates:
                by_label[label] = min(candidates, key=lambda word: abs(word.center_y - anchor.center_y))
        if len(by_label) != len(LABELS):
            continue
        labels = [by_label[label] for label in LABELS]
        if any(labels[index].left >= labels[index + 1].left for index in range(len(labels) - 1)):
            continue

        row_top = min(word.top for word in labels)
        row_bottom = max(word.top + word.height for word in labels)
        row_height = max(word.height for word in labels)
        # Choice text can sit slightly above/below its label, but the next
        # question is excluded from the crop. Include wrapped choice lines.
        relevant = [
            word for word in words
            if row_top - row_height <= word.center_y <= row_bottom + row_height * 3
        ]
        choices: dict[str, str] = {}
        for index, label in enumerate(labels):
            left = label.right
            right = labels[index + 1].left if index + 1 < len(labels) else image_width
            column = [
                word for word in relevant
                if word is not label and left <= word.left + word.width / 2 < right
            ]
            column.sort(key=lambda word: (word.top, word.left))
            value = clean_detected_text(" ".join(word.text for word in column))
            if value:
                choices[LABELS[index]] = value
        if len(choices) >= 2:
            return max(0, row_top - max(8, row_height // 2)), choices
    return None


def extract_question(image, lang: str, number: int) -> tuple[str, dict[str, str]]:
    words = ocr_words(image, lang, 6)
    horizontal = horizontal_choice_row(words, image.width)
    if horizontal:
        choice_top, choices = horizontal
        body_image = image.crop((0, 0, image.width, choice_top))
        text, _ = parse_choices(ocr_text(body_image, lang, 6), number)
        return text, choices
    return parse_choices(ocr_text(image, lang, 6), number)


def find_starts(page_lines: list[list[OcrLine]], maximum: int) -> list[QuestionStart]:
    candidates: list[QuestionStart] = []
    for page_index, lines in enumerate(page_lines):
        for line in lines:
            text = normalize(line.text)
            match = HEADING_RE.match(text)
            if not match:
                continue
            if re.search(r"から\s*[問間]\s*\d", text):
                continue
            number = int(normalize(match.group(1)))
            candidates.append(QuestionStart(number, page_index, line.top))
    if len(candidates) == maximum:
        return [
            QuestionStart(index + 1, candidate.page_index, candidate.top)
            for index, candidate in enumerate(candidates)
        ]
    if len(candidates) == maximum - 1:
        def agreement(missing: int) -> int:
            return sum(
                candidate.number == (index + 1 if index + 1 < missing else index + 2)
                for index, candidate in enumerate(candidates)
            )

        missing = max(range(1, maximum + 1), key=agreement)
        if agreement(missing) >= maximum // 2:
            insert_at = missing - 1
            previous = candidates[insert_at - 1] if insert_at > 0 else None
            following = candidates[insert_at] if insert_at < len(candidates) else None
            if previous and following and previous.page_index == following.page_index:
                page_index = previous.page_index
                top = (previous.top + following.top) // 2
            elif following:
                page_index = following.page_index
                top = 0
            elif previous:
                page_index = previous.page_index
                top = previous.top + 100
            else:
                page_index = 0
                top = 0
            recovered = [*candidates]
            recovered.insert(insert_at, QuestionStart(missing, page_index, top))
            return [
                QuestionStart(index + 1, candidate.page_index, candidate.top)
                for index, candidate in enumerate(recovered)
            ]
    starts: list[QuestionStart] = []
    expected = 1
    for index, candidate in enumerate(candidates):
        if candidate.number < expected:
            continue
        # OCR commonly changes the tens digit (10 -> 19, 50 -> 59) or adds
        # another digit (100 -> 199). Document order is more trustworthy.
        # A difference of exactly one is retained as a genuinely missing
        # heading so incomplete scans are still reported rather than shifted.
        repeated_next = candidate.number == expected + 1 and any(
            later.number == candidate.number for later in candidates[index + 1:index + 4]
        )
        number = (
            candidate.number
            if candidate.number in (expected, expected + 1) and not repeated_next
            else expected
        )
        if number > maximum:
            break
        starts.append(QuestionStart(number, candidate.page_index, candidate.top))
        expected = number + 1
    return starts


def detect_question_starts(pages, dpi: int, lang: str, maximum: int) -> list[QuestionStart]:
    """Detect headings at a scale that is stable for small Japanese type."""
    heading_dpi = min(dpi, 200)
    scale = heading_dpi / dpi
    if scale < 1:
        _, _, Image, _, _, _ = load_runtime()
        heading_pages = [
            page.resize(
                (max(1, round(page.width * scale)), max(1, round(page.height * scale))),
                Image.Resampling.LANCZOS,
            )
            for page in pages
        ]
    else:
        heading_pages = pages
    page_lines = []
    for page in heading_pages:
        headings: list[OcrLine] = []
        # Automatic layout and sparse-text modes recover complementary
        # headings on pages containing diagrams or multi-column choices.
        for psm in (3, 11, 12):
            for line in ocr_lines(page, lang, psm):
                if not HEADING_RE.match(normalize(line.text)):
                    continue
                scaled = OcrLine(line.text, round(line.top / scale), round(line.bottom / scale))
                if any(abs(existing.top - scaled.top) <= 24 / scale for existing in headings):
                    continue
                headings.append(scaled)
        page_lines.append(sorted(headings, key=lambda line: line.top))
    return find_starts(page_lines, maximum)


def question_crop(pages, starts: list[QuestionStart], index: int):
    start = starts[index]
    next_start = starts[index + 1] if index + 1 < len(starts) else None
    segments = []
    last_page = next_start.page_index if next_start else start.page_index
    for page_index in range(start.page_index, last_page + 1):
        image = pages[page_index]
        top = start.top - 20 if page_index == start.page_index else int(image.height * 0.04)
        bottom = next_start.top - 20 if next_start and page_index == next_start.page_index else int(image.height * 0.96)
        if bottom > top:
            segments.append(image.crop((int(image.width * 0.035), max(0, top), int(image.width * 0.965), bottom)))
    width = max(segment.width for segment in segments)
    _, _, Image, _, _, _ = load_runtime()
    output = Image.new("RGB", (width, sum(segment.height for segment in segments)), "white")
    y = 0
    for segment in segments:
        output.paste(segment, (0, y))
        y += segment.height
    return output, list(range(start.page_index + 1, last_page + 2))


def image_data_url(image) -> tuple[str, int]:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=82, method=6)
    payload = buffer.getvalue()
    return "data:image/webp;base64," + base64.b64encode(payload).decode("ascii"), len(payload)


def ocr_text(image, lang: str, psm: int = 6) -> str:
    _, pytesseract, _, _, _, _ = load_runtime()
    return pytesseract.image_to_string(prepare_image(image), lang=lang, config=f"--oem 1 --psm {psm}")


def extract_answer_text(path: Path, lang: str, dpi: int) -> str:
    fitz, _, _, _, _, _ = load_runtime()
    document = fitz.open(path)
    try:
        text = "\n".join(page.get_text() for page in document)
    finally:
        document.close()
    if len(text.strip()) >= 30:
        return text
    return "\n".join(ocr_text(page, lang, 6) for page in render_pages(path, dpi))


def build_archive(args) -> dict:
    maximum = 100 if args.exam == "it-passport" else 80
    pages = render_pages(args.questions, args.dpi)
    starts = detect_question_starts(pages, args.dpi, args.lang, maximum)
    if not starts:
        raise SystemExit("No question headings were detected. Check Tesseract Japanese data and PDF quality.")
    detected_numbers = {start.number for start in starts}
    missing_headings = sorted(set(range(1, maximum + 1)) - detected_numbers)
    if missing_headings:
        raise SystemExit(
            f"Detected {len(starts)}/{maximum} question headings; "
            f"missing {missing_headings}. No incomplete archive was written."
        )
    answers = parse_answers(extract_answer_text(args.answers, args.lang, args.dpi), maximum) if args.answers else {}
    questions = []
    for index, start in enumerate(starts):
        print(f"OCR question {start.number}/{maximum}", file=sys.stderr)
        crop, source_pages = question_crop(pages, starts, index)
        text, choices = extract_question(crop, args.lang, start.number)
        warnings = []
        if len(choices) < 4:
            warnings.append(f"Detected {len(choices)} choices; review against the PDF.")
        if start.number not in answers:
            warnings.append("Correct answer was not detected.")
        visual = bool(re.search(r"(?:図|表|グラフ|フローチャート|構成図)", text)) or len(choices) < 4
        figure = None
        if visual or args.keep_all_images:
            data_url, size = image_data_url(crop)
            figure = {"filename": f"{args.exam_key}-question-{start.number}.webp", "mime_type": "image/webp", "data_url": data_url, "size_bytes": size}
        questions.append({
            "number": start.number,
            "source_key": f"{args.exam_key}:Q{start.number}",
            "text": text or f"{args.exam_key} 問{start.number}",
            "choices": choices or {label: label for label in LABELS},
            "correct_answer": answers.get(start.number, ""),
            "has_figure": figure is not None,
            "figure": figure,
            "confidence": "high" if not warnings else "review",
            "warnings": warnings,
            "subject_id": subject_id(args.exam, start.number),
            "explanation": "",
            "difficulty": 2,
            "points": 1,
            "source_pages": source_pages,
        })
    missing = sorted(set(range(1, maximum + 1)) - {question["number"] for question in questions})
    metadata_warnings = [f"Missing question numbers: {missing}"] if missing else []
    return {
        "schema_version": "manabi-question-archive-v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exam": args.exam_key,
        "exam_date": args.exam_date,
        "import_exam": args.exam,
        "question_count": len(questions),
        "subject_ranges": [],
        "warnings": metadata_warnings,
        "questions": questions,
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--exam", choices=("it-passport", "ap"), required=True)
    result.add_argument("--questions", type=Path, required=True)
    result.add_argument("--answers", type=Path)
    result.add_argument("--exam-key", required=True)
    result.add_argument("--exam-date", required=True, help="YYYY-MM-DD")
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--lang", default="jpn+eng")
    result.add_argument("--dpi", type=int, default=300)
    result.add_argument("--keep-all-images", action="store_true")
    return result


def main() -> int:
    args = parser().parse_args()
    for path in (args.questions, args.answers):
        if path and not path.is_file():
            raise SystemExit(f"PDF not found: {path}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.exam_date):
        raise SystemExit("--exam-date must use YYYY-MM-DD")
    archive = build_archive(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(archive['questions'])} questions to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
