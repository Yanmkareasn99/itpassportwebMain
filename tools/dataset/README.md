# Completed IT Passport dataset export

`export_supabase_dataset.py` converts the 2009–2026 archive into the current
Supabase `questions` and `answer_choices` row shapes. It does not contact or
change Supabase.

Run from the project root:

```powershell
python tools/dataset/export_supabase_dataset.py 'C:\Users\User\Desktop\my projects\IT_Passport_Dataset_2009-2026_SITE_COMPLETED\IT_Passport_Dataset_2009-2026_SITE_COMPLETED'
```

The generated `imports/it_passport_clean/` folder contains:

- `questions.json` and `answer_choices.json`: only columns supported by the current tables.
- `assets/`: the 1,304 question and choice images needed for the simplified records.
- `asset_manifest.json`: maps question and choice identifiers to Storage object paths.
- `report.json`: counts and the 46 duplicate-text and two multiple-answer decisions.

The offline JSON has `image_url: null`. **Do not import it before supplying image
URLs**, or image questions will display without their diagrams. Upload the
contents of `assets/` to the public `question-images` Storage bucket, retaining
paths beneath `assets/`. Then rerun with the bucket's public URL prefix:

```powershell
python tools/dataset/export_supabase_dataset.py 'C:\Users\User\Desktop\my projects\IT_Passport_Dataset_2009-2026_SITE_COMPLETED\IT_Passport_Dataset_2009-2026_SITE_COMPLETED' --public-base-url 'https://PROJECT.supabase.co/storage/v1/object/public/question-images'
```

That run also produces `questions.csv` and `answer_choices.csv` for the Admin
CSV importer. The importer requires the seeded IT Passport subjects. Importing
into an existing database may still find conflicts with existing questions;
this export does not clear or overwrite database rows.

For the connected project, `scripts/import_cleaned_it_passport.mjs` can upload
the packaged images and then import both tables in batches. It reads a
service-role or secret key from `SUPABASE_SERVICE_ROLE_KEY` or from the
Git-ignored `imports/.supabase-import.env` file. Never put this key in frontend
environment variables or commit it to Git. Run `node scripts/import_cleaned_it_passport.mjs`
for a local validation first, then `node scripts/import_cleaned_it_passport.mjs --apply`.
If an import stops partway through, use `--apply --resume` to upsert the same
bundle. The script checks live subjects and table counts before writing.

The export uses `exam_year` and `exam_month`. Source IDs such as `2009h21a`
map to October 2009, while `2009h21h` maps to April 2009. Annual CBT and
special sets have no known month, so `exam_month` is blank. Apply the
`20260922000000_add_exam_year_month.sql` migration before importing. After the
frontend that reads year and month has been deployed, apply
`20260922010000_remove_question_exam_day.sql` to remove the legacy day column.
Subject IDs follow the app's default
question-number ranges: 1–35 strategy, 36–55 management, 56–100 technology.
For two questions with multiple accepted official answers, the first answer is
the primary answer required by the current app; both accepted answers remain
listed in `report.json`. The source archive remains unchanged.
