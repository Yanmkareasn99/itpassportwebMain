# PDF question imports

## Use the Admin panel

After the one-time migration below has been applied, an administrator can open
**Admin → Questions → Import PDFs**. Select the exam type, enter a stable exam
key such as `2026B`, choose the question PDF and optional answer PDF, and click
**Read PDFs**.

The review screen lets the administrator check the rendered question pages,
edit extracted text and choices, assign subjects, and select answers that were
not detected. Click **Import/update all** to upload question images to Supabase
Storage and import the reviewed questions and choices directly. Reusing the
same exam key updates the existing exam.

No CSV conversion, CSV download, terminal command, or Dashboard CSV upload is
part of this workflow.

Image-only scanned PDFs are handled with Japanese OCR in the browser. They take
longer to process than searchable PDFs, and unclear scans may need manual fixes
on the review screen.

## Save the conversion as JSON

After reading and reviewing the PDFs, click **Download JSON** to save a portable
`manabi-question-archive-v2` archive. Its readable fields include `exam`,
`year`, `wareki`, `season`, `question_count`, `text`, a label-to-text `choices`
object, `correct_answer`, `has_figure`, `confidence`, and `warnings`. It also
retains the database-ready exam date/type, subject assignments, explanations,
source pages, scoring fields, and any question images selected with **Keep
diagram**. Unselected page-preview images are omitted to keep the JSON
reasonably small. Older `manabi-pdf-import-v1` archives remain supported.

For a later import, return to **Admin → Questions → Import PDFs**, select the
archive under **Saved question JSON**, continue reviewing if needed, and click
**Upload questions and answers**. PDF files are not required when reloading the
JSON archive.

## One-time setup

Apply
`supabase/migrations/20260903010000_add_single_csv_question_import.sql` to the
Supabase project. Despite its historical filename, this migration provides the
staging table, synchronization trigger, and `question-images` Storage bucket
used by the direct Admin-panel importer.

New question images use HTTPS Storage URLs in `image_url`. Historical images
under `src/data/img` remain a compatibility fallback. Run
`npm run generate:image-metadata` whenever historical source JSON or fallback
image paths change; production builds run it automatically.

## Backfill dates for existing questions

Older imports discarded the `year` value embedded in historical JSON. After
applying `20260915010000_add_question_exam_dates.sql`, set a service-role
connection locally and run the matcher:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-secret-service-role-key"
npm run backfill:exam-dates
npm run backfill:exam-dates -- --apply
```

The first command is a dry run. The second updates only rows whose `exam_date`
is null.
