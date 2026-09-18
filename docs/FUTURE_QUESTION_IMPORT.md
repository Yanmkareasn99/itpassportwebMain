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
