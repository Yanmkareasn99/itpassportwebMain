# Manabi IT Passport

Manabi IT Passport is a React and Supabase study app for the Japanese IT Passport exam. It includes practice questions, mock exams, multilingual explanations, admin content tools, and an AI study assistant with local fallback answers.

Demo: itpassportwebapp-eta.vercel.app

## Screenshots

![Login screen](docs/screenshots/manabi%20login.png)

![Home dashboard](docs/screenshots/manabi%20home.png)

![Practice question flow](docs/screenshots/manabi%20practice.png)

![Mock exam](docs/screenshots/manabi%20mock%20exam.png)

![Battle mode](docs/screenshots/manabi%20battle.png)

![Learning materials](docs/screenshots/manabi%20materials.png)

![AI chat assistant](docs/screenshots/manabi%20ai%20chat.png)

![Settings](docs/screenshots/manabi%20settings.png)

## Features

- Authenticated learning dashboard with Supabase Auth and local demo-mode fallback.
- Practice by subject, difficulty, question type, new questions, or missed-question review.
- Mock exam and battle-mode screens for timed and competitive study workflows.
- AI chat and per-question explanations through a Supabase Edge Function.
- Local AI fallback explanations when Supabase or Gemini is unavailable.
- Japanese, English, and Vietnamese localization.
- Admin tools for questions, subjects, users, stats, CSV import, and PDF question import.
- Real browser URLs with route guards for signed-in and admin-only pages.
- Standardized CSV, scoring, auth, rate-limit, error, and data helper modules.

## Stack

- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security, and Edge Functions
- Gemini API via Supabase Edge Function
- PDF.js and Tesseract.js for question import workflows
- Vitest and React Testing Library
- npm

## Architecture

```text
src/
  App.tsx                    Route tree and guards
  contexts/                  Auth and language providers
  pages/                     Route-level screens
  components/
    admin/                   Admin importer, forms, and tab components
    ui/                      Shared loading/error UI
  hooks/                     Shared async data hooks
  lib/                       Supabase client, data services, CSV, scoring, AI, auth helpers
  i18n/                      Translation catalogs and helpers
  data/                      Bundled seed/question assets
supabase/
  migrations/                Database schema and policies
  functions/ai-chat/         Authenticated, rate-limited AI proxy
tests/
  lib/                       Auth and AI fallback tests
  utils/                     CSV, scoring, and localization tests
```

Routing is handled in `src/App.tsx`. Signed-in pages are wrapped by `ProtectedRoute`; `/admin` is additionally wrapped by `AdminRoute`. The existing page components still receive `currentPage` and `onNavigate` so navigation UI remains simple while browser back/forward works.

Admin code is split into four tabs:

- `QuestionsTab`
- `SubjectsTab`
- `UsersTab`
- `StatsTab`

Shared admin form state lives in `src/components/admin/forms.ts`, and CSV parsing lives in `src/lib/csv.ts`.

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ALLOWED_ORIGINS=https://itpassportweb-app.vercel.app
```

4. Start the app:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
```

## Supabase

Apply migrations from `supabase/migrations` to create the Manabi schema, authorization policies, admin helpers, AI chat message storage, and question import support.

The AI Edge Function expects:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_key
ALLOWED_ORIGIN=https://itpassportweb-app.vercel.app
GEMINI_MODEL=gemini-3.5-flash-lite
```

`ALLOWED_ORIGIN` is exact-match only. Multiple production origins can be comma-separated.

## Tests

Run all tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:coverage
```

Current focused coverage includes:

- CSV parser edge cases
- Scoring utilities
- Localization helpers
- AI fallback behavior and client-side rate limiting
- Auth token helpers

## Data And Errors

Supabase calls should throw or surface errors instead of ignoring them. New shared helpers live in:

- `src/lib/errorHandling.ts`
- `src/lib/dataService.ts`
- `src/hooks/useData.ts`
- `src/components/ui/LoadingError.tsx`

## Package Management

This repository uses npm. `pnpm-lock.yaml` and `pnpm-workspace.yaml` were removed to avoid mixed package-manager state.
