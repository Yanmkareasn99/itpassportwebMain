#!/usr/bin/env python3
"""Convert exam question/answer PDFs into review JSON and one Supabase CSV.

The generated CSV embeds rendered question pages (and optional choice images)
as data URLs. It can therefore be uploaded by itself to
public.question_import_staging in the Supabase Dashboard.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any
from uuid import UUID

try:
    import pymupdf
    from PIL import Image, ImageChops
except ImportError as error:
    raise SystemExit(
        "Missing PDF import packages. Run: python -m pip install -r "
        "scripts/requirements-pdf-import.txt"
    ) from error


CHOICE_LABELS = tuple("アイウエオカキクケコ")
MEMO_MARKERS = ("メモ用紙", "メ モ 用 紙")
TRAILING_PAGE_MARKERS = ("試験問題に記載されている会社名", "無断転載を禁ず")
CSV_COLUMNS = (
    "source_key",
    "subject_id",
    "question_number",
    "question_text",
    "question_type",
    "image_url",
    "answer_choices",
    "explanation",
    "difficulty",
    "points",
    "explanation_ja",
    "explanation_en",
    "explanation_vi",
)


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).replace("\u3000", " ")


def clean_pdf_text(value: str) -> str:
    lines: list[str] = []
    for raw_line in value.replace("\r", "").split("\n"):
        line = raw_line.strip()
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if re.fullmatch(r"[－—-]?\s*\d+\s*[－—-]?", normalized(line)):
            continue
        lines.append(line)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def find_question_starts(document: pymupdf.Document) -> list[tuple[int, int]]:
    starts: list[tuple[int, int]] = []
    seen: set[int] = set()
    for page_index, page in enumerate(document):
        text = normalized(page.get_text("text"))
        if "問題番号" in text and "注意事項" in text:
            continue
        match = re.search(r"(?:^|\n)\s*問\s*(\d{1,3})(?=\s)", text)
        if not match:
            continue
        number = int(match.group(1))
        if number not in seen:
            starts.append((number, page_index))
            seen.add(number)
    return sorted(starts, key=lambda item: item[1])


def trim_rendered_page(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    # Remove the common page-number footer before trimming surrounding whitespace.
    footerless = rgb.crop((0, 0, width, max(1, height - int(height * 0.065))))
    difference = ImageChops.difference(footerless, Image.new("RGB", footerless.size, "white"))
    bbox = difference.getbbox()
    if not bbox:
        return footerless
    margin = max(18, width // 60)
    left = max(0, bbox[0] - margin)
    top = max(0, bbox[1] - margin)
    right = min(width, bbox[2] + margin)
    bottom = min(footerless.height, bbox[3] + margin)
    return footerless.crop((left, top, right, bottom))


def render_question_pages(
    document: pymupdf.Document,
    page_indexes: list[int],
    output_file: Path,
    dpi: int,
) -> None:
    rendered: list[Image.Image] = []
    scale = dpi / 72
    for page_index in page_indexes:
        page = document[page_index]
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        image = Image.open(io.BytesIO(pixmap.tobytes("png")))
        rendered.append(trim_rendered_page(image))

    max_width = max(image.width for image in rendered)
    gap = max(16, max_width // 70)
    total_height = sum(image.height for image in rendered) + gap * (len(rendered) - 1)
    combined = Image.new("RGB", (max_width, total_height), "white")
    top = 0
    for image in rendered:
        left = (max_width - image.width) // 2
        combined.paste(image, (left, top))
        top += image.height + gap

    output_file.parent.mkdir(parents=True, exist_ok=True)
    combined.save(output_file, "WEBP", quality=84, method=6)


def parse_choice_group(text: str) -> list[dict[str, Any]]:
    marker = normalized(text).find("解答群")
    if marker < 0:
        return []
    group = normalized(text)[marker + len("解答群") :]
    choices: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    label_pattern = re.compile(rf"^\s*([{''.join(CHOICE_LABELS)}])(?:\s+(.+))?\s*$")

    for raw_line in group.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = label_pattern.match(line)
        if match:
            if current:
                current["text"] = " ".join(current.pop("parts")).strip() or current["label"]
                choices.append(current)
            current = {"label": match.group(1), "parts": [match.group(2) or ""]}
        elif current:
            current["parts"].append(line)

    if current:
        current["text"] = " ".join(current.pop("parts")).strip() or current["label"]
        choices.append(current)

    # A column heading such as "a"/"b" can appear before the first choice, but
    # duplicate kana labels indicate that text extraction was not row-oriented.
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for choice in choices:
        if choice["label"] not in seen:
            unique.append(choice)
            seen.add(choice["label"])
    return unique


def extract_answer_map_from_pdf(path: Path) -> dict[int, str]:
    document = pymupdf.open(path)
    result: dict[int, str] = {}
    label_class = "".join(CHOICE_LABELS)

    for page in document:
        text = normalized(page.get_text("text"))
        for number, label in re.findall(
            rf"問\s*(\d{{1,3}})\s*(?:[:：=\-]\s*)?([{label_class}])(?=\s|$)", text
        ):
            result[int(number)] = label

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for index, line in enumerate(lines):
            numbers = [int(value) for value in re.findall(r"問\s*(\d{1,3})", line)]
            if not numbers:
                continue
            for answer_line in lines[index + 1 : index + 4]:
                labels = re.findall(rf"(?<!\S)([{label_class}])(?!\S)", answer_line)
                if len(labels) == len(numbers):
                    result.update(zip(numbers, labels))
                    break

        try:
            table_finder = page.find_tables()
            tables = table_finder.tables
        except Exception:
            tables = []
        for table in tables:
            for row in table.extract():
                row_text = " ".join(normalized(cell or "") for cell in row)
                for number, label in re.findall(
                    rf"問?\s*(\d{{1,3}})\s*[:：=\-]?\s*([{label_class}])", row_text
                ):
                    result[int(number)] = label
    return result


def collect_answer_dicts(
    value: Any, path: tuple[str, ...] = ()
) -> list[tuple[tuple[str, ...], dict[int, str]]]:
    candidates: list[tuple[tuple[str, ...], dict[int, str]]] = []
    if isinstance(value, dict):
        direct: dict[int, str] = {}
        for key, item in value.items():
            if str(key).isdigit() and str(item).strip() in CHOICE_LABELS:
                direct[int(key)] = str(item).strip()
        if direct:
            candidates.append((path, direct))
        else:
            for key, item in value.items():
                candidates.extend(collect_answer_dicts(item, path + (str(key),)))
    return candidates


def find_answer_dict(value: Any, exam_key: str | None) -> dict[int, str]:
    candidates = collect_answer_dicts(value)
    if not candidates:
        return {}
    if not exam_key or len(candidates) == 1:
        return candidates[0][1]

    key = normalized(exam_key).upper()
    year_match = re.search(r"20\d{2}(?:\d{2})?", key)
    year = year_match.group(0) if year_match else ""

    def score(candidate: tuple[tuple[str, ...], dict[int, str]]) -> int:
        path, _ = candidate
        normalized_path = [normalized(part).upper() for part in path]
        joined = "/".join(normalized_path)
        value_score = 0
        if key in normalized_path:
            value_score += 100
        if year and year in normalized_path:
            value_score += 40
        if key.endswith("B") and "科目B" in joined:
            value_score += 30
        if key.endswith("S") and "修了" in joined:
            value_score += 30
        if key.endswith("A") and "科目A" in joined and "修了" not in joined:
            value_score += 30
        return value_score

    return max(candidates, key=score)[1]


def load_answer_map(source: str | None, exam_key: str | None) -> dict[int, str]:
    if not source:
        return {}
    path = Path(source)
    if path.exists():
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            return extract_answer_map_from_pdf(path)
        if suffix == ".json":
            with path.open("r", encoding="utf-8-sig") as handle:
                return find_answer_dict(json.load(handle), exam_key)
        if suffix == ".csv":
            result: dict[int, str] = {}
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                for row in csv.DictReader(handle):
                    number = row.get("question_number") or row.get("number") or row.get("question")
                    answer = row.get("correct_choice") or row.get("answer")
                    if number and answer:
                        result[int(normalized(number).removeprefix("問"))] = answer.strip()
            return result
        raise ValueError(f"Unsupported answer file: {path}")

    result: dict[int, str] = {}
    for number, label in re.findall(
        rf"(\d{{1,3}})\s*[:：=\-]\s*([{''.join(CHOICE_LABELS)}])", normalized(source)
    ):
        result[int(number)] = label
    return result


def extract_review_json(args: argparse.Namespace) -> Path:
    question_pdf = Path(args.questions).resolve()
    if not question_pdf.exists():
        raise FileNotFoundError(question_pdf)
    UUID(args.subject_id)

    output_dir = Path(args.output_dir or f"imports/{args.exam_key}").resolve()
    image_dir = output_dir / "images"
    review_file = output_dir / "review.json"
    document = pymupdf.open(question_pdf)
    starts = find_question_starts(document)
    if args.start_page:
        starts = [item for item in starts if item[1] + 1 >= args.start_page]
    if args.end_page:
        starts = [item for item in starts if item[1] + 1 <= args.end_page]
    if not starts:
        raise ValueError("No question headings like '問1' were found in the selected PDF pages.")

    answers = load_answer_map(args.answers, args.exam_key)
    questions: list[dict[str, Any]] = []
    for position, (number, start_index) in enumerate(starts):
        next_index = starts[position + 1][1] if position + 1 < len(starts) else len(document)
        if args.end_page:
            next_index = min(next_index, args.end_page)
        page_indexes = []
        for page_index in range(start_index, next_index):
            page = document[page_index]
            page_text = normalized(page.get_text("text"))
            if any(marker in page_text for marker in MEMO_MARKERS):
                continue
            if any(marker in page_text for marker in TRAILING_PAGE_MARKERS):
                continue
            if (
                page_index != start_index
                and len(clean_pdf_text(page_text)) < 80
                and not page.get_drawings()
                and not page.get_images(full=True)
            ):
                continue
            page_indexes.append(page_index)
        if not page_indexes:
            continue

        combined_text = "\n".join(document[index].get_text("text") for index in page_indexes)
        clean_text = clean_pdf_text(combined_text)
        answer_group_at = normalized(clean_text).find("解答群")
        question_text = clean_text[:answer_group_at].strip() if answer_group_at >= 0 else clean_text
        image_file = image_dir / f"question-{number}.webp"
        render_question_pages(document, page_indexes, image_file, args.dpi)

        choices = parse_choice_group(clean_text)
        correct_choice = answers.get(number)
        if correct_choice and correct_choice not in {choice["label"] for choice in choices}:
            choices.append({"label": correct_choice, "text": correct_choice})
        for index, choice in enumerate(choices, start=1):
            choice["sort_order"] = index

        warnings: list[str] = []
        if not correct_choice:
            warnings.append("Correct answer was not found; set correct_choice before creating CSV.")
        if len(choices) < 2:
            warnings.append("Fewer than two choices were extracted; review the answer group.")

        questions.append(
            {
                "source_key": f"{args.exam_key}:Q{number}",
                "number": number,
                "question_text": question_text or f"{args.exam_key} 問{number}",
                "question_type": "multiple_choice",
                "image_file": image_file.relative_to(output_dir).as_posix(),
                "source_pages": [index + 1 for index in page_indexes],
                "choices": choices,
                "correct_choice": correct_choice,
                "explanation": "",
                "difficulty": 2,
                "points": 1,
                "warnings": warnings,
            }
        )

    payload = {
        "format_version": 1,
        "exam_key": args.exam_key,
        "subject_id": args.subject_id,
        "source_question_pdf": str(question_pdf),
        "source_answer": args.answers,
        "questions": questions,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    with review_file.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return review_file


def file_to_data_url(path: Path) -> str:
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }
    mime_type = mime_types.get(path.suffix.lower())
    if not mime_type:
        raise ValueError(f"Unsupported image type: {path}")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def resolve_image(value: str | None, json_dir: Path) -> str:
    if not value:
        return ""
    if value.startswith(("data:", "https://", "http://")):
        return value
    path = Path(value)
    if not path.is_absolute():
        path = json_dir / path
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return file_to_data_url(path)


def write_import_csv(review_file: Path, csv_file: Path) -> tuple[int, int]:
    with review_file.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    subject_id = str(payload.get("subject_id", ""))
    UUID(subject_id)
    rows: list[dict[str, Any]] = []
    errors: list[str] = []

    for question in payload.get("questions", []):
        number = question.get("number")
        choices = question.get("choices") or []
        correct_choice = question.get("correct_choice")
        labels = [str(choice.get("label", "")).strip() for choice in choices]
        if not question.get("source_key"):
            errors.append(f"Question {number}: source_key is missing")
        if not str(question.get("question_text", "")).strip():
            errors.append(f"Question {number}: question_text is missing")
        if len(choices) < 2:
            errors.append(f"Question {number}: at least two choices are required")
        if not correct_choice or correct_choice not in labels:
            errors.append(f"Question {number}: correct_choice must match one choice label")
            continue

        choice_payload = []
        for index, choice in enumerate(choices, start=1):
            label = str(choice.get("label", "")).strip()
            image_value = choice.get("image_file") or choice.get("image_url")
            choice_payload.append(
                {
                    "label": label,
                    "text": str(choice.get("text") or label),
                    "image_url": resolve_image(image_value, review_file.parent),
                    "is_correct": label == correct_choice,
                    "sort_order": int(choice.get("sort_order") or index),
                }
            )

        image_value = question.get("image_file") or question.get("image_url")
        explanation = str(question.get("explanation") or "")
        rows.append(
            {
                "source_key": question["source_key"],
                "subject_id": subject_id,
                "question_number": int(number),
                "question_text": question["question_text"],
                "question_type": question.get("question_type") or "multiple_choice",
                "image_url": resolve_image(image_value, review_file.parent),
                "answer_choices": json.dumps(choice_payload, ensure_ascii=False, separators=(",", ":")),
                "explanation": explanation,
                "difficulty": int(question.get("difficulty") or 2),
                "points": int(question.get("points") or 1),
                "explanation_ja": str(question.get("explanation_ja") or explanation),
                "explanation_en": str(question.get("explanation_en") or ""),
                "explanation_vi": str(question.get("explanation_vi") or ""),
            }
        )

    if errors:
        message = "\n".join(f"- {error}" for error in errors)
        raise ValueError(f"Review JSON is incomplete:\n{message}")

    csv_file.parent.mkdir(parents=True, exist_ok=True)
    with csv_file.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)
    embedded_images = sum(bool(row["image_url"]) for row in rows) + sum(
        bool(choice["image_url"])
        for row in rows
        for choice in json.loads(row["answer_choices"])
    )
    return len(rows), embedded_images


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create review JSON and one Supabase-ready CSV from exam PDFs."
    )
    parser.add_argument("--questions", help="Question PDF")
    parser.add_argument("--answers", help="Answer PDF/JSON/CSV or mapping such as 1=ア,2=イ")
    parser.add_argument("--subject-id", help="Existing Supabase subjects.id UUID")
    parser.add_argument("--exam-key", help="Stable unique exam key, for example 2026A")
    parser.add_argument("--output-dir", help="Review JSON/image directory (default: imports/EXAM_KEY)")
    parser.add_argument("--csv", dest="csv_file", help="Output CSV (default: supabase/import/EXAM_KEY.csv)")
    parser.add_argument("--from-json", help="Skip PDF extraction and create CSV from reviewed JSON")
    parser.add_argument("--dpi", type=int, default=130, help="Rendered question-image DPI (default: 130)")
    parser.add_argument("--start-page", type=int, help="First PDF page to inspect (1-based)")
    parser.add_argument("--end-page", type=int, help="Last PDF page to include (1-based)")
    args = parser.parse_args()

    if not args.from_json and not (args.questions and args.subject_id and args.exam_key):
        parser.error("PDF mode requires --questions, --subject-id, and --exam-key")
    return args


def main() -> int:
    args = parse_args()
    try:
        if args.from_json:
            review_file = Path(args.from_json).resolve()
            if not review_file.exists():
                raise FileNotFoundError(review_file)
            exam_key = args.exam_key
            if not exam_key:
                with review_file.open("r", encoding="utf-8-sig") as handle:
                    exam_key = json.load(handle).get("exam_key") or review_file.parent.name
        else:
            review_file = extract_review_json(args)
            exam_key = args.exam_key
            print(f"Review JSON: {review_file}")

        csv_file = Path(args.csv_file or f"supabase/import/{exam_key}.csv").resolve()
        row_count, image_count = write_import_csv(review_file, csv_file)
        size_mb = csv_file.stat().st_size / 1024 / 1024
        print(f"Import CSV: {csv_file}")
        print(f"Ready: {row_count} questions, {image_count} embedded images, {size_mb:.1f} MB")
        return 0
    except (FileNotFoundError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        if not args.from_json and "review_file" in locals():
            print(
                "The review JSON was kept. Correct it, then run: "
                f"python scripts/prepare_question_import.py --from-json \"{review_file}\"",
                file=sys.stderr,
            )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
