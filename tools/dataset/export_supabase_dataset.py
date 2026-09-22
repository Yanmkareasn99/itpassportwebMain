"""Convert the completed IT Passport archive to the app's Supabase row shape.

Usage:
  python tools/dataset/export_supabase_dataset.py SOURCE_DIR [--output imports/it_passport_clean]
  python tools/dataset/export_supabase_dataset.py SOURCE_DIR --public-base-url https://PROJECT.supabase.co/storage/v1/object/public/question-images

The first command creates a clean, offline bundle. Supplying a public Storage
base URL also writes CSVs whose image_url columns point at the bundled assets.
Upload the contents of assets/ to the question-images bucket before importing.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import unicodedata
import uuid
from collections import Counter
from pathlib import Path
from urllib.parse import quote


LETTERS = ("ア", "イ", "ウ", "エ")
SUBJECTS = (
    (35, "cc000001-0000-0000-0000-000000000001"),
    (55, "cc000002-0000-0000-0000-000000000001"),
    (100, "cc000003-0000-0000-0000-000000000001"),
)
NAMESPACE = uuid.UUID("9612e1dc-7d92-45cf-95b8-dd1a511b5403")
QUESTION_COLUMNS = (
    "id", "subject_id", "question_number", "question_text", "question_type",
    "image_url", "explanation", "difficulty", "points", "exam_year", "exam_month",
    "source_key", "explanation_ja", "explanation_en", "explanation_vi",
)
CHOICE_COLUMNS = (
    "id", "question_id", "choice_text", "image_url", "is_correct", "sort_order",
)


def normalized(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text).lower())


def subject_id(number: int) -> str:
    for maximum, subject in SUBJECTS:
        if number <= maximum:
            return subject
    raise ValueError(f"Question number outside 1–100: {number}")


def exam_month(item: dict) -> int | None:
    source_id = str(item.get("id", ""))
    source_period = re.match(r"^[0-9]{4}(?:h|r)[0-9]{2}([aho])_", source_id)
    if source_period:
        return 4 if source_period.group(1) == "h" else 10
    session = item.get("session")
    if session == "spring":
        return 4
    if session in ("autumn", "october"):
        return 10
    return None


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def export(source: Path, output: Path, public_base_url: str | None) -> dict:
    source = source.resolve()
    output = output.resolve()
    if source == output or source in output.parents:
        raise ValueError("Output must be outside the source dataset directory.")
    items = json.loads((source / "questions.json").read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("questions.json must contain an array.")
    output.mkdir(parents=True, exist_ok=True)
    assets_dir = output / "assets"
    assets_dir.mkdir(exist_ok=True)
    base = public_base_url.rstrip("/") if public_base_url else None

    questions: list[dict] = []
    choices: list[dict] = []
    assets: dict[str, str] = {}
    seen_text: set[str] = set()
    seen_ids: set[str] = set()
    duplicates: list[dict] = []
    multiple_answers: list[dict] = []

    def asset_url(relative_path: str | None, owner: str) -> str | None:
        if not relative_path:
            return None
        relative = Path(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Unsafe asset path: {relative_path}")
        original = (source / relative).resolve()
        if not original.is_file() or source not in original.parents:
            raise FileNotFoundError(original)
        object_path = "dataset-2009-2026/" + relative.as_posix()
        destination = assets_dir / Path(object_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            shutil.copy2(original, destination)
        assets[owner] = object_path
        return f"{base}/{quote(object_path, safe='/')}" if base else None

    for item in items:
        source_id = item["id"]
        if source_id in seen_ids:
            raise ValueError(f"Duplicate source ID: {source_id}")
        seen_ids.add(source_id)
        number = int(item["question_number"])
        question_text = item["question_text"].strip()
        if not question_text:
            raise ValueError(f"Empty question text: {source_id}")
        if normalized(question_text) in seen_text:
            # The database rejects identical normalized question text. Prefixing
            # a source identifier keeps repeated exam appearances distinct.
            question_text = f"【{source_id}】 {question_text}"
            duplicates.append({"source_id": source_id, "change": "source ID prefixed to question_text"})
        if normalized(question_text) in seen_text:
            raise ValueError(f"Question text still duplicates another: {source_id}")
        seen_text.add(normalized(question_text))

        answer_letters = item["correct_answer_letters"]
        if not answer_letters or any(letter not in LETTERS for letter in answer_letters):
            raise ValueError(f"Invalid correct answer: {source_id}")
        primary_answer = answer_letters[0]
        if len(answer_letters) > 1:
            multiple_answers.append({
                "source_id": source_id,
                "accepted_answers": answer_letters,
                "selected_primary_answer": primary_answer,
            })

        question_id = str(uuid.uuid5(NAMESPACE, f"question:{source_id}"))
        has_question_visual = bool(item.get("visual_assets") or item.get("shared_contexts"))
        question_scan = (item.get("source_scans") or [None])[0] if has_question_visual else None
        questions.append({
            "id": question_id,
            "subject_id": subject_id(number),
            "question_number": number,
            "question_text": question_text,
            "question_type": "multiple_choice",
            "image_url": asset_url(question_scan, f"question:{source_id}"),
            "explanation": None,
            "difficulty": 2,
            "points": 1,
            "exam_year": int(item["year"]),
            "exam_month": exam_month(item),
            "source_key": f"ipa_itpass:{source_id}",
            "explanation_ja": None,
            "explanation_en": None,
            "explanation_vi": None,
        })

        options = item["options"]
        visuals = item.get("answer_option_visuals") or {}
        if set(options) != set(LETTERS):
            raise ValueError(f"Question must have four labeled choices: {source_id}")
        for order, letter in enumerate(LETTERS, start=1):
            choice_text = options[letter].strip()
            if not choice_text:
                raise ValueError(f"Empty choice {letter}: {source_id}")
            if item.get("option_format") != "text" and not visuals.get(letter):
                raise ValueError(f"Missing choice image {letter}: {source_id}")
            choices.append({
                "id": str(uuid.uuid5(NAMESPACE, f"choice:{source_id}:{letter}")),
                "question_id": question_id,
                "choice_text": choice_text,
                "image_url": asset_url(visuals.get(letter), f"choice:{source_id}:{letter}"),
                "is_correct": letter == primary_answer,
                "sort_order": order,
            })

    if len(questions) != len(items) or len(choices) != len(items) * 4:
        raise AssertionError("Exported row count does not match the input.")
    if len({q["source_key"] for q in questions}) != len(questions):
        raise AssertionError("Source keys are not unique.")
    if any(sum(c["is_correct"] for c in choices[i:i + 4]) != 1 for i in range(0, len(choices), 4)):
        raise AssertionError("Every question must have exactly one primary answer.")

    (output / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "answer_choices.json").write_text(json.dumps(choices, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "asset_manifest.json").write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "source_questions": len(items),
        "exported_questions": len(questions),
        "exported_answer_choices": len(choices),
        "assets": len(set(assets.values())),
        "subject_counts": dict(Counter(q["subject_id"] for q in questions)),
        "duplicate_text_adjustments": duplicates,
        "multiple_answer_simplifications": multiple_answers,
        "csv_generated": bool(base),
    }
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if base:
        write_csv(output / "questions.csv", QUESTION_COLUMNS, questions)
        write_csv(output / "answer_choices.csv", CHOICE_COLUMNS, choices)
    else:
        for filename in ("questions.csv", "answer_choices.csv"):
            (output / filename).unlink(missing_ok=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Extracted dataset directory containing questions.json")
    parser.add_argument("--output", type=Path, default=Path("imports/it_passport_clean"))
    parser.add_argument("--public-base-url", help="Public URL prefix for the question-images Storage bucket")
    args = parser.parse_args()
    report = export(args.source, args.output, args.public_base_url)
    print(json.dumps({key: value for key, value in report.items() if not isinstance(value, list)}, indent=2))
    print(f"Duplicate text adjustments: {len(report['duplicate_text_adjustments'])}")
    print(f"Multiple-answer simplifications: {len(report['multiple_answer_simplifications'])}")


if __name__ == "__main__":
    main()
