# Future PDF question imports

## Recommended: use the Admin panel

After the one-time migration below has been applied, an administrator can open
**Admin → Questions → Import PDFs** in the web app. Select the subject, enter a
stable exam key such as `2026B`, choose the question PDF and answer PDF, and
click **Read PDFs**.

The review screen lets the administrator check the rendered question pages,
edit extracted text and choices, and select any answers that were not detected.
Click **Import/update all** to upload the images to Supabase Storage and sync all
questions and choices. Reusing the same exam key updates the existing exam.

No terminal command or CSV upload is needed for this Admin-panel workflow.

Image-only scanned PDFs are handled automatically with Japanese OCR in the
browser. They take longer to read than text-based PDFs. The review screen is
still required because unclear scans can need a corrected question number or
answer selection.

## Optional command-line workflow

The command-line workflow turns a question PDF plus its answer key into:

1. a readable `review.json` file;
2. one CSV containing the questions, choices, correct answers, and images;
3. normalized rows in Supabase after one Dashboard upload.

The images are embedded in the CSV as `data:` URLs. No separate Storage upload
or frontend deployment is required.

## One-time setup

Install the converter dependencies:

```powershell
python -m pip install -r scripts/requirements-pdf-import.txt
```

In Supabase Dashboard, open **SQL Editor**, copy the complete contents of
`supabase/migrations/20260903010000_add_single_csv_question_import.sql`, and
run it once.

This creates `question_import_staging`, its import trigger, and the public
`question-images` Storage bucket used by the Admin panel.

## Create the JSON and CSV

Example for a 科目B exam:

```powershell
npm run prepare:pdf-import -- `
  --questions "C:\path\2026B-questions.pdf" `
  --answers "C:\path\2026B-answers.pdf" `
  --subject-id "aa000000-0000-0000-0000-000000000002" `
  --exam-key "2026B"
```

Subject IDs already in this project:

- 科目A: `aa000000-0000-0000-0000-000000000001`
- 科目B: `aa000000-0000-0000-0000-000000000002`
- ITパスポート: `aa000000-0000-0000-0000-000000000003`

The command creates:

- `imports/2026B/review.json`
- `imports/2026B/images/question-*.webp`
- `supabase/import/2026B.csv`

The question-page images preserve PDF diagrams, tables, code, and graphical
answer groups even when PDF text extraction cannot understand their layout.

## Review before upload

Open `imports/2026B/review.json` and check each `correct_choice` and `choices`
list. If the answer PDF cannot be read automatically, the converter keeps the
JSON and tells you what is missing. Set values such as:

```json
"correct_choice": "ウ"
```

You can also add a separate image to an answer choice:

```json
{
  "label": "ア",
  "text": "ア",
  "image_file": "images/question-1-choice-a.png",
  "sort_order": 1
}
```

After editing the JSON, rebuild only the CSV:

```powershell
npm run prepare:pdf-import -- --from-json "imports/2026B/review.json"
```

For a simple answer list instead of an answer PDF, use:

```powershell
--answers "1=ウ,2=ア,3=エ,4=イ"
```

## Upload the one CSV

1. Open Supabase Dashboard → **Table Editor**.
2. Open `question_import_staging`.
3. Choose **Insert → Import data from CSV**.
4. Upload `supabase/import/2026B.csv`.

Uploading the same exam again updates it because `source_key` is stable (for
example `2026B:Q1`). It does not create a second copy of that question.

Verify the import in SQL Editor:

```sql
select
  q.source_key,
  q.question_number,
  q.image_url is not null as has_question_image,
  count(ac.id) as choices,
  count(*) filter (where ac.is_correct) as correct_choices
from questions q
join answer_choices ac on ac.question_id = q.id
where q.source_key like '2026B:%'
group by q.id
order by q.question_number;
```

Every result should show `has_question_image = true` and
`correct_choices = 1`.
