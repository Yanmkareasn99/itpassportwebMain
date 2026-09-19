#!/usr/bin/env python3
"""Convert IPA IT Passport/AP question and answer PDFs to a Manabi archive.

Accuracy-oriented version:
- multi-pass OCR with Japanese/English fallback
- confidence-aware question heading detection
- safer question segmentation across pages
- stricter choice parsing
- conservative answer-key parsing (does not guess when ambiguous)
- duplicate/missing question validation
- OCR retries for difficult crops
"""

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

# Accept OCR variants commonly produced for 問 / 間 and full-width digits.
HEADING_RE = re.compile(
    r"^[\s「『【(（]*[問間門]\s*([0-9０-９]{1,3})"
    r"(?:\s*[、。：:.．)]|\s|$)"
)

ANSWER_PAIR_RE = re.compile(
    r"(?:問\s*)?([0-9０-９]{1,3})\s*([アイウエ])(?=\s|$|[,、。])"
)

CHOICE_RE = re.compile(
    r"(?<![ァ-ヶー])([アイウエ])(?=\s|[.:：、)]|$)"
)

FULLWIDTH_TRANSLATION = str.maketrans(
    "０１２３４５６７８９，．：；（），［］",
    "0123456789,.:;(),[]",
)


@dataclass(frozen=True)
class OcrLine:
    text: str
    top: int
    bottom: int
    confidence: float = 0.0


@dataclass(frozen=True)
class QuestionStart:
    number: int
    page_index: int
    top: int
    confidence: float


def normalize(text: str) -> str:
    text = text.translate(FULLWIDTH_TRANSLATION)
    text = text.replace("\u3000", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def normalize_answer_label(value: str) -> str:
    value = normalize(value)
    return value if value in LABELS else ""


def parse_choices(raw_text: str, number: int) -> tuple[str, dict[str, str]]:
    """Parse a question while requiring real A/B/C/D-style Japanese markers.

    A choice marker must be separated from surrounding Japanese text. This
    avoids accidentally treating characters inside words as choice labels.
    """
    lines = [normalize(line) for line in raw_text.splitlines() if normalize(line)]

    if lines:
        lines[0] = re.sub(
            rf"^[問間門]\s*{number}\s*[、。：:.．)]?\s*",
            "",
            lines[0],
        )

    body: list[str] = []
    choices: dict[str, list[str]] = {}
    current: str | None = None

    for line in lines:
        matches = list(CHOICE_RE.finditer(line))

        if not matches:
            if current:
                choices[current].append(line)
            else:
                body.append(line)
            continue

        prefix = line[: matches[0].start()].strip()
        if prefix:
            (choices[current] if current else body).append(prefix)

        for i, match in enumerate(matches):
            label = match.group(1)
            current = label
            choices.setdefault(label, [])

            end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
            value = line[match.end():end].strip(" \t:：、.-")
            if value:
                choices[label].append(value)

    clean_choices = {
        label: " ".join(parts).strip()
        for label, parts in choices.items()
        if " ".join(parts).strip()
    }

    # If OCR produced duplicate/malformed labels, do not silently invent choices.
    if set(clean_choices) != set(LABELS):
        return "\n".join(body).strip(), clean_choices

    return "\n".join(body).strip(), clean_choices


def parse_answers(text: str, maximum: int) -> tuple[dict[int, str], list[str]]:
    """Parse an answer key conservatively.

    Only accept a mapping when a question number has exactly one observed
    answer label. Conflicts are reported instead of choosing arbitrarily.
    """
    answers: dict[int, str] = {}
    warnings: list[str] = []

    lines = [normalize(line) for line in text.splitlines() if normalize(line)]

    candidates: dict[int, set[str]] = {}

    # Pass 1: explicit pairs such as 1 ア 2 イ ...
    for match in ANSWER_PAIR_RE.finditer("\n".join(lines)):
        number = int(match.group(1))
        label = normalize_answer_label(match.group(2))
        if 1 <= number <= maximum and label:
            candidates.setdefault(number, set()).add(label)

    # Pass 2: answer-key rows where numbers are followed by the same count
    # of labels within the next few lines.
    for index, line in enumerate(lines):
        numbers = [
            int(normalize(value))
            for value in re.findall(r"(?:問\s*)?([0-9]{1,3})", line)
        ]
        numbers = [n for n in numbers if 1 <= n <= maximum]
        if len(numbers) < 2:
            continue

        for candidate in lines[index + 1:index + 5]:
            labels = [x for x in re.findall(r"[アイウエ]", candidate)]
            if len(labels) == len(numbers):
                for number, label in zip(numbers, labels):
                    candidates.setdefault(number, set()).add(label)
                break

    for number, labels in sorted(candidates.items()):
        if len(labels) == 1:
            answers[number] = next(iter(labels))
        elif len(labels) > 1:
            warnings.append(
                f"Conflicting answer-key entries for question {number}: "
                f"{','.join(sorted(labels))}"
            )

    return answers, warnings


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
            "Missing scanner dependencies. Run: "
            "pip install -r tools/exam_scanner/requirements.txt"
        ) from error
    return fitz, pytesseract, Image, ImageEnhance, ImageFilter, ImageOps


def render_pages(pdf_path: Path, dpi: int):
    fitz, _, Image, _, _, _ = load_runtime()
    document = fitz.open(pdf_path)
    scale = dpi / 72
    pages = []
    try:
        for page in document:
            pixmap = page.get_pixmap(
                matrix=fitz.Matrix(scale, scale),
                colorspace=fitz.csRGB,
                alpha=False,
            )
            pages.append(
                Image.frombytes(
                    "RGB",
                    (pixmap.width, pixmap.height),
                    pixmap.samples,
                )
            )
    finally:
        document.close()
    return pages


def prepare_image(image, mode: str = "normal"):
    _, _, _, ImageEnhance, ImageFilter, ImageOps = load_runtime()

    gray = ImageOps.grayscale(image)
    if mode == "strong":
        gray = ImageEnhance.Contrast(gray).enhance(2.2)
        gray = ImageOps.autocontrast(gray)
        return gray.filter(ImageFilter.SHARPEN)

    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    return gray.filter(ImageFilter.SHARPEN)


def ocr_data(image, lang: str, psm: int = 6, mode: str = "normal"):
    _, pytesseract, _, _, _, _ = load_runtime()
    return pytesseract.image_to_data(
        prepare_image(image, mode),
        lang=lang,
        config=f"--oem 1 --psm {psm}",
        output_type=pytesseract.Output.DICT,
    )


def ocr_lines(image, lang: str, psm: int = 6) -> list[OcrLine]:
    data = ocr_data(image, lang, psm)
    grouped: dict[tuple[int, int, int], list[tuple[int, str, int, int, float]]] = {}

    for index, raw in enumerate(data["text"]):
        text = normalize(raw)
        if not text:
            continue

        key = (
            data["block_num"][index],
            data["par_num"][index],
            data["line_num"][index],
        )
        top = int(data["top"][index])
        height = int(data["height"][index])
        try:
            confidence = float(data["conf"][index])
        except (ValueError, TypeError):
            confidence = 0.0

        grouped.setdefault(key, []).append(
            (
                int(data["left"][index]),
                text,
                top,
                top + height,
                confidence,
            )
        )

    result: list[OcrLine] = []
    for words in grouped.values():
        words.sort(key=lambda item: item[0])
        result.append(
            OcrLine(
                " ".join(word[1] for word in words),
                min(word[2] for word in words),
                max(word[3] for word in words),
                sum(word[4] for word in words) / len(words),
            )
        )

    return sorted(result, key=lambda line: (line.top, line.bottom))


def ocr_text(image, lang: str, psms=(6, 4), retry=True) -> str:
    """Run more than one segmentation mode and keep the richer result."""
    texts = []

    for psm in psms:
        for mode in ("normal", "strong") if retry else ("normal",):
            _, pytesseract, _, _, _, _ = load_runtime()
            value = pytesseract.image_to_string(
                prepare_image(image, mode),
                lang=lang,
                config=f"--oem 1 --psm {psm}",
            )
            value = value.strip()
            if value:
                texts.append(value)

    if not texts:
        return ""

    # Prefer the OCR result with the most choice markers and then most text.
    def score(value: str):
        labels = len(re.findall(r"[アイウエ]", value))
        return (labels, len(value))

    return max(texts, key=score)


def find_starts(
    page_lines: list[list[OcrLine]],
    maximum: int,
) -> list[QuestionStart]:
    """Find a sequential question series and suppress duplicate OCR hits."""
    candidates: list[QuestionStart] = []

    for page_index, lines in enumerate(page_lines):
        for line in lines:
            normalized = normalize(line.text)
            match = HEADING_RE.match(normalized)
            if not match:
                continue

            number = int(normalize(match.group(1)))
            if 1 <= number <= maximum:
                # Heading confidence is useful for tie-breaking only.
                candidates.append(
                    QuestionStart(
                        number,
                        page_index,
                        line.top,
                        line.confidence,
                    )
                )

    # For the same question on the same page, retain the strongest detection.
    best: dict[tuple[int, int], QuestionStart] = {}
    for candidate in candidates:
        key = (candidate.number, candidate.page_index)
        previous = best.get(key)
        if previous is None or candidate.confidence > previous.confidence:
            best[key] = candidate

    candidates = sorted(
        best.values(),
        key=lambda item: (item.page_index, item.top),
    )

    # Build the longest plausible sequential run. This prevents one bad OCR
    # heading from causing all later questions to be segmented incorrectly.
    starts: list[QuestionStart] = []
    expected = 1

    for candidate in candidates:
        if candidate.number == expected:
            starts.append(candidate)
            expected += 1
            continue

        if candidate.number == expected - 1:
            continue

        # If the expected number exists elsewhere, wait for it.
        if any(x.number == expected for x in candidates):
            continue

        # Only allow a gap when the candidate is very plausible.
        if candidate.number > expected and candidate.confidence >= 70:
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

        top = (
            start.top - 24
            if page_index == start.page_index
            else int(image.height * 0.035)
        )

        if next_start and page_index == next_start.page_index:
            # Keep the entire previous question, but stop shortly before
            # the next heading.
            bottom = max(top + 20, next_start.top - 24)
        else:
            bottom = int(image.height * 0.97)

        if bottom > top:
            segments.append(
                image.crop(
                    (
                        int(image.width * 0.025),
                        max(0, top),
                        int(image.width * 0.975),
                        min(image.height, bottom),
                    )
                )
            )

    if not segments:
        raise RuntimeError(f"Unable to crop question {start.number}")

    _, _, Image, _, _, _ = load_runtime()
    width = max(segment.width for segment in segments)
    output = Image.new(
        "RGB",
        (width, sum(segment.height for segment in segments)),
        "white",
    )

    y = 0
    for segment in segments:
        output.paste(segment, (0, y))
        y += segment.height

    return output, list(range(start.page_index + 1, last_page + 2))


def image_data_url(image) -> tuple[str, int]:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=88, method=6)
    payload = buffer.getvalue()
    return (
        "data:image/webp;base64," + base64.b64encode(payload).decode("ascii"),
        len(payload),
    )


def extract_answer_text(path: Path, lang: str, dpi: int) -> str:
    fitz, _, _, _, _, _ = load_runtime()
    document = fitz.open(path)
    try:
        text = "\n".join(page.get_text() for page in document)
    finally:
        document.close()

    # Text-layer PDFs are preferable to OCR because the answer key is usually
    # tabular and OCR can reorder cells. Still OCR if the text layer is tiny.
    if len(text.strip()) >= 100:
        return text

    return "\n".join(
        ocr_text(page, lang, psms=(6, 4), retry=True)
        for page in render_pages(path, dpi)
    )


def question_quality(text: str, choices: dict[str, str]) -> tuple[str, list[str]]:
    warnings: list[str] = []

    if not text.strip():
        warnings.append("Question text is empty after OCR.")

    if len(text.strip()) < 20:
        warnings.append("Question text is unusually short; review against PDF.")

    if len(choices) != 4:
        warnings.append(
            f"Detected {len(choices)} choices; review against the PDF."
        )

    missing = [label for label in LABELS if label not in choices]
    if missing:
        warnings.append(
            "Missing choice labels: " + ", ".join(missing)
        )

    return ("high" if not warnings else "review"), warnings


def build_archive(args) -> dict:
    maximum = 100 if args.exam == "it-passport" else 80

    pages = render_pages(args.questions, args.dpi)
    page_lines = [ocr_lines(page, args.lang, 6) for page in pages]
    starts = find_starts(page_lines, maximum)

    if not starts:
        raise SystemExit(
            "No question headings were detected. "
            "Check Tesseract Japanese data and PDF quality."
        )

    answers: dict[int, str] = {}
    answer_warnings: list[str] = []

    if args.answers:
        answers, answer_warnings = parse_answers(
            extract_answer_text(args.answers, args.lang, args.dpi),
            maximum,
        )

    questions = []
    seen_numbers: set[int] = set()

    for index, start in enumerate(starts):
        print(
            f"OCR question {start.number}/{maximum}",
            file=sys.stderr,
        )

        if start.number in seen_numbers:
            continue
        seen_numbers.add(start.number)

        try:
            crop, source_pages = question_crop(pages, starts, index)
        except Exception as error:
            questions.append(
                {
                    "number": start.number,
                    "source_key": f"{args.exam_key}:Q{start.number}",
                    "text": f"{args.exam_key} 問{start.number}",
                    "choices": {},
                    "correct_answer": answers.get(start.number, ""),
                    "has_figure": True,
                    "figure": None,
                    "confidence": "review",
                    "warnings": [f"Question crop failed: {error}"],
                    "subject_id": subject_id(args.exam, start.number),
                    "explanation": "",
                    "difficulty": 2,
                    "points": 1,
                    "source_pages": [],
                }
            )
            continue

        raw_ocr = ocr_text(crop, args.lang, psms=(6, 4), retry=True)
        text, choices = parse_choices(raw_ocr, start.number)

        confidence, warnings = question_quality(text, choices)

        if start.number not in answers:
            warnings.append("Correct answer was not detected.")
        elif answers[start.number] not in choices:
            warnings.append(
                f"Correct answer '{answers[start.number]}' is not among "
                "the detected choices."
            )

        visual = bool(
            re.search(
                r"(?:図|表|グラフ|フローチャート|構成図|画面|ネットワーク図)",
                raw_ocr,
            )
        ) or len(choices) < 4

        figure = None
        if visual or args.keep_all_images:
            data_url, size = image_data_url(crop)
            figure = {
                "filename": f"{args.exam_key}-question-{start.number}.webp",
                "mime_type": "image/webp",
                "data_url": data_url,
                "size_bytes": size,
            }

        questions.append(
            {
                "number": start.number,
                "source_key": f"{args.exam_key}:Q{start.number}",
                "text": text or f"{args.exam_key} 問{start.number}",
                "choices": choices,
                "correct_answer": answers.get(start.number, ""),
                "has_figure": figure is not None,
                "figure": figure,
                "confidence": confidence,
                "warnings": warnings,
                "subject_id": subject_id(args.exam, start.number),
                "explanation": "",
                "difficulty": 2,
                "points": 1,
                "source_pages": source_pages,
            }
        )

    missing = sorted(set(range(1, maximum + 1)) - seen_numbers)

    metadata_warnings = []
    if missing:
        metadata_warnings.append(
            f"Missing question numbers: {missing}"
        )
    metadata_warnings.extend(answer_warnings)

    review_count = sum(
        question["confidence"] == "review"
        for question in questions
    )

    if review_count:
        metadata_warnings.append(
            f"{review_count} questions require OCR/PDF review."
        )

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
    result.add_argument(
        "--exam",
        choices=("it-passport", "ap"),
        required=True,
    )
    result.add_argument("--questions", type=Path, required=True)
    result.add_argument("--answers", type=Path)
    result.add_argument("--exam-key", required=True)
    result.add_argument("--exam-date", required=True, help="YYYY-MM-DD")
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--lang", default="jpn+eng")
    result.add_argument(
        "--dpi",
        type=int,
        default=350,
        help="PDF rendering DPI; 350 is safer for small Japanese text.",
    )
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
    args.output.write_text(
        json.dumps(archive, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    review_count = sum(
        question["confidence"] == "review"
        for question in archive["questions"]
    )

    print(
        f"Wrote {len(archive['questions'])} questions to {args.output} "
        f"({review_count} need review)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())