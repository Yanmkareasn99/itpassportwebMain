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
HEADING_RE = re.compile(r"^[問間]\s*([0-9０-９]{1,3})(?:\s|[、。：:.])")
ANSWER_PAIR_RE = re.compile(r"(?:問\s*)?([0-9０-９]{1,3})\s*([アイウエ])")


@dataclass(frozen=True)
class OcrLine:
    text: str
    top: int
    bottom: int


@dataclass(frozen=True)
class QuestionStart:
    number: int
    page_index: int
    top: int


def normalize(text: str) -> str:
    table = str.maketrans("０１２３４５６７８９，．", "0123456789,.")
    return re.sub(r"[ \t]+", " ", text.translate(table)).strip()


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
    return "\n".join(body).strip(), {
        label: " ".join(parts).strip() for label, parts in choices.items() if " ".join(parts).strip()
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


def find_starts(page_lines: list[list[OcrLine]], maximum: int) -> list[QuestionStart]:
    candidates: list[QuestionStart] = []
    for page_index, lines in enumerate(page_lines):
        for line in lines:
            match = HEADING_RE.match(normalize(line.text))
            if not match:
                continue
            number = int(normalize(match.group(1)))
            if 1 <= number <= maximum:
                candidates.append(QuestionStart(number, page_index, line.top))
    starts: list[QuestionStart] = []
    expected = 1
    for candidate in candidates:
        if candidate.number == expected:
            starts.append(candidate)
            expected += 1
        elif candidate.number == expected - 1:
            continue
        elif candidate.number > expected and not any(item.number == expected for item in candidates):
            starts.append(candidate)
            expected = candidate.number + 1
    return starts


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
    page_lines = [ocr_lines(page, args.lang, 6) for page in pages]
    starts = find_starts(page_lines, maximum)
    if not starts:
        raise SystemExit("No question headings were detected. Check Tesseract Japanese data and PDF quality.")
    answers = parse_answers(extract_answer_text(args.answers, args.lang, args.dpi), maximum) if args.answers else {}
    questions = []
    for index, start in enumerate(starts):
        print(f"OCR question {start.number}/{maximum}", file=sys.stderr)
        crop, source_pages = question_crop(pages, starts, index)
        text, choices = parse_choices(ocr_text(crop, args.lang, 6), start.number)
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
