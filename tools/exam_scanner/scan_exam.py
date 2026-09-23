#!/usr/bin/env python3
"""Convert IPA IT Passport/AP question and answer PDFs to a Manabi archive.

Accuracy-oriented version:
- multi-pass OCR with Japanese/English fallback
- Otsu binarization plus contrast/unsharp preprocessing passes tuned for
  small Japanese glyphs, with preserve_interword_spaces enabled so
  Tesseract doesn't inject spurious spaces inside Japanese text
- confidence-aware question heading detection
- safer question segmentation across pages
- stricter choice parsing
- conservative answer-key parsing (does not guess when ambiguous)
- duplicate/missing question validation
- OCR retries for difficult crops, including a sparse-text pass for
  question crops that mix body text with figures/diagrams
- conservative row/column detection for separate answer-choice images
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import itertools
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

# 工 (kanji, "labor/construction") is visually near-identical to エ
# (katakana) in most exam PDF fonts, and Tesseract's Japanese model
# regularly substitutes one for the other when it appears as an isolated
# choice marker. We accept both here and normalize back to エ.
CHOICE_MARKER_CONFUSABLES = "アイウエ工"

ANSWER_PAIR_RE = re.compile(
    r"(?:問\s*)?([0-9０-９]{1,3})\s*([アイウエ工])(?=\s|$|[,、。])"
)

CHOICE_RE = re.compile(
    r"(?<![ァ-ヶー])([アイウエ工])(?=\s|[.:：、)]|$)"
)

FULLWIDTH_TRANSLATION = str.maketrans(
    "０１２３４５６７８９，．：；（），［］",
    "0123456789,.:;(),[]",
)

# Keywords indicating the question body refers to a diagram/table/chart the
# reader needs to see (as opposed to being answerable from text alone).
# 図 and グラフ and 表 already match as substrings inside most compound
# terms (ER図, クラス図, 状態遷移図, 棒グラフ, 貸借対照表, ...), so this
# list only needs to add the terms that don't contain those characters.
VISUAL_KEYWORD_RE = re.compile(
    r"(?:図|表|グラフ|チャート|ヒストグラム|計算書|ダイアグラム|"
    r"マトリクス|マトリックス|画面|真理値)"
)


@dataclass(frozen=True)
class OcrLine:
    text: str
    top: int
    bottom: int
    confidence: float = 0.0


@dataclass(frozen=True)
class OcrWord:
    text: str
    left: int
    top: int
    width: int
    height: int


def clean_detected_text(value: str) -> str:
    """Remove OCR-only spacing inside Japanese while preserving Latin tokens."""
    value = normalize(value)
    japanese = r"\u3040-\u30ff\u3400-\u9fff"
    value = re.sub(rf"(?<=[{japanese}])\s+(?=[{japanese}])", "", value)
    value = re.sub(r"([、。，．])\s+", r"\1", value)
    return value


def horizontal_choice_row(words: list[OcrWord], image_width: int):
    """Read four choices printed on one physical row using x coordinates."""
    markers = []
    for word in words:
        label = normalize_choice_label(normalize(word.text))
        if label in LABELS and len(normalize(word.text)) == 1:
            markers.append((label, word))
    for anchor_label, anchor in markers:
        nearby = [(label, word) for label, word in markers if abs(word.top - anchor.top) <= max(12, anchor.height)]
        best = {}
        for label, word in nearby:
            previous = best.get(label)
            if previous is None or abs(word.top - anchor.top) < abs(previous.top - anchor.top):
                best[label] = word
        if set(best) != set(LABELS):
            continue
        ordered = [best[label] for label in LABELS]
        if any(ordered[index].left >= ordered[index + 1].left for index in range(3)):
            continue
        if ordered[-1].left - ordered[0].left < image_width * 0.45:
            continue
        centers = [word.left + word.width / 2 for word in ordered]
        boundaries = [0] + [round((centers[index] + centers[index + 1]) / 2) for index in range(3)] + [image_width]
        choices = {}
        for index, label in enumerate(LABELS):
            parts = [
                word for word in words
                if abs(word.top - anchor.top) <= max(12, anchor.height)
                and boundaries[index] <= word.left + word.width / 2 < boundaries[index + 1]
                and normalize_choice_label(normalize(word.text)) != label
            ]
            parts.sort(key=lambda word: word.left)
            text = " ".join(clean_detected_text(word.text) for word in parts).strip()
            if text:
                choices[label] = text
        if set(choices) == set(LABELS):
            return min(word.top for word in ordered), choices
    return None


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


def normalize_choice_label(value: str) -> str:
    """Map OCR-confusable characters onto the canonical アイウエ label."""
    return "エ" if value == "工" else value


def normalize_answer_label(value: str) -> str:
    value = normalize_choice_label(normalize(value))
    return value if value in LABELS else ""


def parse_choices(raw_text: str, number: int) -> tuple[str, dict[str, str]]:
    """Parse a question while requiring real A/B/C/D-style Japanese markers.

    A choice marker must be separated from surrounding Japanese text. This
    avoids accidentally treating characters inside words as choice labels.
    """
    # Tesseract occasionally doubles an isolated choice marker glyph
    # (e.g. "エエ" instead of "エ"); collapse that before segmenting lines
    # so it isn't mistaken for two adjacent, ambiguous markers.
    raw_text = re.sub(
        r"([アイウエ工])\1+(?=\s|[.:：、)]|$)", r"\1", raw_text
    )

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
            label = normalize_choice_label(match.group(1))
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
            labels = [
                normalize_choice_label(x)
                for x in re.findall(r"[アイウエ工]", candidate)
            ]
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


def otsu_threshold(gray_image) -> int:
    """Compute an Otsu binarization threshold from a grayscale image.

    Implemented from the raw histogram so no extra dependency (e.g. OpenCV)
    is required. Clean Otsu binarization removes paper texture and light
    scanner shading that otherwise confuses Tesseract's Japanese models on
    small, dense kanji.
    """
    histogram = gray_image.histogram()
    total = sum(histogram)
    if total == 0:
        return 128

    sum_all = sum(intensity * count for intensity, count in enumerate(histogram))

    sum_background = 0.0
    weight_background = 0
    best_threshold = 0
    best_variance = -1.0

    for threshold, count in enumerate(histogram):
        weight_background += count
        if weight_background == 0:
            continue

        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break

        sum_background += threshold * count
        mean_background = sum_background / weight_background
        mean_foreground = (sum_all - sum_background) / weight_foreground

        variance = (
            weight_background
            * weight_foreground
            * (mean_background - mean_foreground) ** 2
        )
        if variance > best_variance:
            best_variance = variance
            best_threshold = threshold

    return best_threshold


def prepare_image(image, mode: str = "normal"):
    _, _, _, ImageEnhance, ImageFilter, ImageOps = load_runtime()

    gray = ImageOps.grayscale(image)

    if mode == "strong":
        gray = ImageEnhance.Contrast(gray).enhance(2.2)
        gray = ImageOps.autocontrast(gray)
        return gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150))

    if mode == "binarized":
        # Otsu binarization strips background shading/paper texture, which
        # is one of the more common causes of misread kanji strokes.
        gray = ImageOps.autocontrast(gray)
        threshold = otsu_threshold(gray)
        return gray.point(lambda value: 255 if value > threshold else 0)

    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    return gray.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120))


def tesseract_config(psm: int, dpi: int) -> str:
    # preserve_interword_spaces matters a lot for Japanese: without it,
    # Tesseract's LSTM segmenter sometimes inserts or drops spaces between
    # characters that have no real word boundary, corrupting choice parsing.
    # Passing the real render DPI avoids Tesseract guessing a wrong scale
    # for small Japanese glyphs.
    return (
        f"--oem 1 --psm {psm} "
        f"-c preserve_interword_spaces=1 "
        f"-c user_defined_dpi={dpi}"
    )


def ocr_data(image, lang: str, psm: int = 6, mode: str = "normal", dpi: int = 350):
    _, pytesseract, _, _, _, _ = load_runtime()
    return pytesseract.image_to_data(
        prepare_image(image, mode),
        lang=lang,
        config=tesseract_config(psm, dpi),
        output_type=pytesseract.Output.DICT,
    )


def ocr_lines(image, lang: str, psm: int = 6, dpi: int = 350) -> list[OcrLine]:
    data = ocr_data(image, lang, psm, dpi=dpi)
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


def ocr_words(image, lang: str, psm: int = 11, dpi: int = 350) -> list[OcrWord]:
    data = ocr_data(image, lang, psm, dpi=dpi)
    words = []
    for index, raw in enumerate(data["text"]):
        text = normalize(raw)
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


def detect_choice_regions(words: list[OcrWord], width: int, height: int):
    """Return four safe row/column crops, or an empty dict if ambiguous."""
    by_label: dict[str, list[OcrWord]] = {label: [] for label in LABELS}
    for word in words:
        raw = normalize(word.text)
        label = normalize_choice_label(raw)
        if len(raw) == 1 and label in by_label:
            by_label[label].append(word)
    if any(not by_label[label] for label in LABELS):
        return {}

    best = None
    pools = [by_label[label][-6:] for label in LABELS]
    for selected in itertools.product(*pools):
        centers_x = [word.left + word.width / 2 for word in selected]
        centers_y = [word.top + word.height / 2 for word in selected]
        x_span = max(centers_x) - min(centers_x)
        y_span = max(centers_y) - min(centers_y)
        rows = all(centers_y[i] > centers_y[i - 1] for i in range(1, 4)) and x_span <= width * .14 and y_span >= height * .08
        columns = all(centers_x[i] > centers_x[i - 1] for i in range(1, 4)) and y_span <= height * .08 and x_span >= width * .25
        if not rows and not columns:
            continue
        score = x_span + y_span * .01 if rows else y_span + x_span * .01
        if best is None or score < best[0]:
            best = (score, selected, "rows" if rows else "columns")
    if best is None:
        return {}

    _, selected, layout = best
    margin = max(8, round(width * .008))
    result = {}
    if layout == "rows":
        centers = [word.top + word.height / 2 for word in selected]
        boundaries = [round((centers[i] + centers[i + 1]) / 2) for i in range(3)]
        top = max(0, selected[0].top - margin)
        for index, label in enumerate(LABELS):
            row_top = boundaries[index - 1] if index else top
            row_bottom = boundaries[index] if index < 3 else height
            result[label] = (0, row_top, width, row_bottom)
    else:
        centers = [word.left + word.width / 2 for word in selected]
        boundaries = [round((centers[i] + centers[i + 1]) / 2) for i in range(3)]
        top = max(0, min(word.top for word in selected) - margin)
        for index, label in enumerate(LABELS):
            left = boundaries[index - 1] if index else 0
            right = boundaries[index] if index < 3 else width
            result[label] = (left, top, right, height)
    return result


def trim_image(image, margin: int = 12):
    _, _, _, _, _, ImageOps = load_runtime()
    gray = ImageOps.grayscale(image)
    mask = gray.point(lambda value: 255 if value < 245 else 0)
    box = mask.getbbox()
    if not box:
        return image
    left, top, right, bottom = box
    return image.crop((max(0, left - margin), max(0, top - margin), min(image.width, right + margin), min(image.height, bottom + margin)))


JAPANESE_CHAR_RE = re.compile(
    r"[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]"
)


def ocr_text(image, lang: str, psms=(6, 4), retry=True, dpi: int = 350) -> str:
    """Run more than one segmentation mode and keep the richer result."""
    texts = []

    modes = ("normal", "strong", "binarized") if retry else ("normal",)

    for psm in psms:
        for mode in modes:
            _, pytesseract, _, _, _, _ = load_runtime()
            value = pytesseract.image_to_string(
                prepare_image(image, mode),
                lang=lang,
                config=tesseract_config(psm, dpi),
            )
            value = value.strip()
            if value:
                texts.append(value)

    if not texts:
        return ""

    # Prefer the OCR result with the most choice markers, then the most
    # actual Japanese text (kana/kanji), then raw length as a tie-breaker.
    # Choice-marker count alone previously let a noisy, mostly-garbled pass
    # outscore a clean one that happened to have slightly fewer markers.
    def score(value: str):
        labels = len(re.findall(r"[アイウエ工]", value))
        japanese_chars = len(JAPANESE_CHAR_RE.findall(value))
        return (labels, japanese_chars, len(value))

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
    #
    # Gap tolerance is scaled to the gap size: skipping just one or two
    # question numbers is a normal consequence of a single missed heading
    # and is accepted whenever nothing else claims the expected number
    # (checked above). A large jump is far more likely to be a stray OCR
    # false-positive heading, so it still needs a high-confidence match —
    # otherwise it can permanently strand the real, lower-numbered headings
    # that appear later in `candidates` (they'd never equal the new,
    # much higher `expected` value once we jump past them).
    SMALL_GAP_TOLERANCE = 2
    HIGH_CONFIDENCE_JUMP = 70

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

        if candidate.number <= expected:
            continue

        gap = candidate.number - expected
        if gap <= SMALL_GAP_TOLERANCE or candidate.confidence >= HIGH_CONFIDENCE_JUMP:
            starts.append(candidate)
            expected = candidate.number + 1

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
        ocr_text(page, lang, psms=(6, 4), retry=True, dpi=dpi)
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
    page_lines = [
        ocr_lines(page, args.lang, 6, dpi=args.dpi) for page in pages
    ]
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
                    "choices": {label: label for label in LABELS},
                    "choice_figures": {},
                    "correct_answer": answers.get(start.number, ""),
                    "has_figure": False,
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

        # psm 11 (sparse text) is included here because question crops often
        # mix body text with figures/diagrams, which trips up the
        # column-oriented psm 6/4 assumptions.
        raw_ocr = ocr_text(
            crop, args.lang, psms=(6, 4, 11), retry=True, dpi=args.dpi
        )
        text, choices = parse_choices(raw_ocr, start.number)

        words: list[OcrWord] = []
        if len(choices) < 4 or VISUAL_KEYWORD_RE.search(raw_ocr):
            words = ocr_words(crop, args.lang, 11, args.dpi)
            horizontal = horizontal_choice_row(words, crop.width)
            if horizontal and len(choices) < 4:
                _, choices = horizontal

        visual = bool(VISUAL_KEYWORD_RE.search(raw_ocr)) or len(choices) < 4

        warnings: list[str] = []
        choice_figures = {}
        if visual:
            if not words:
                words = ocr_words(crop, args.lang, 11, args.dpi)
            regions = detect_choice_regions(words, crop.width, crop.height)
            for label, box in regions.items():
                choice_crop = trim_image(crop.crop(box))
                data_url, size = image_data_url(choice_crop)
                choice_figures[label] = {
                    "filename": f"{args.exam_key}-question-{start.number}-choice-{label}.webp",
                    "mime_type": "image/webp",
                    "data_url": data_url,
                    "size_bytes": size,
                }
            if len(choice_figures) == 4:
                choices = {label: choices.get(label, label) for label in LABELS}
            else:
                warnings.append(
                    "Choice images could not be separated safely; verify the full question image."
                )

        confidence, quality_warnings = question_quality(text, choices)
        warnings = quality_warnings + warnings
        if start.number not in answers:
            warnings.append("Correct answer was not detected.")
        elif answers[start.number] not in choices:
            warnings.append(
                f"Correct answer '{answers[start.number]}' is not among "
                "the detected choices."
            )
        confidence = "high" if not warnings else "review"

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
                "choice_figures": choice_figures,
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
        "schema_version": "manabi-question-archive-v3",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exam": args.exam_key,
        "exam_year": int(args.exam_period[:4]),
        "exam_month": int(args.exam_period[5:7]) if len(args.exam_period) > 4 else None,
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
    result.add_argument("--exam-period", "--exam-date", dest="exam_period", required=True, help="YYYY or YYYY-MM")
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--lang", default="jpn+eng")
    result.add_argument(
        "--dpi",
        type=int,
        default=400,
        help=(
            "PDF rendering DPI; 400 gives Tesseract more pixels per "
            "kanji stroke than 350 without a large runtime cost."
        ),
    )
    result.add_argument("--keep-all-images", action="store_true")
    return result


def main() -> int:
    args = parser().parse_args()

    for path in (args.questions, args.answers):
        if path and not path.is_file():
            raise SystemExit(f"PDF not found: {path}")

    if not re.fullmatch(r"\d{4}(?:-(0[1-9]|1[0-2])(?:-\d{2})?)?", args.exam_period):
        raise SystemExit("--exam-period must use YYYY or YYYY-MM")
    args.exam_period = args.exam_period[:7]

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
