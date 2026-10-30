# ExamDesk — Online Exam Management System

A private exam platform for **one teacher and their students**. The teacher creates courses, invites students with secure codes, builds MCQ / written (CQ) / mixed exams, and grades handwritten answers online. Students join with a code, take timed exams with autosave, upload photos of written answers, see their results when released, and keep private study notes.

**Stack:** Next.js 16 (App Router, Cache Components, TypeScript strict) · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage, Row Level Security) · React Hook Form + Zod · TanStack Table v9 · Sonner · Lucide · Vitest.

---

## Table of contents

1. [Features](#1-features)
2. [How it works — teacher and student workflows](#2-how-it-works--teacher-and-student-workflows)
3. [Architecture](#3-architecture)
4. [Project structure](#4-project-structure)
5. [Prerequisites](#5-prerequisites)
6. [Local setup](#6-local-setup)
7. [Environment variables](#7-environment-variables)
8. [Database and migrations](#8-database-and-migrations)
9. [Supabase Auth and email templates](#9-supabase-auth-and-email-templates)
10. [Provision the teacher](#10-provision-the-teacher)
11. [File storage](#11-file-storage)
12. [Deploying to Vercel](#12-deploying-to-vercel)
13. [Development commands and tests](#13-development-commands-and-tests)
14. [Security model](#14-security-model)
15. [Troubleshooting](#15-troubleshooting)
16. [SEO and social sharing](#16-seo-and-social-sharing)
17. [Design decisions and limitations](#17-design-decisions-and-limitations)

---

## 1. Features

### For the teacher

| Area | What you can do |
| --- | --- |
| **Dashboard** | Overview of courses, students, upcoming/live exams and attempts waiting for grading. |
| **Courses** | Create, edit and archive courses. Organise each course into **subjects** and **chapters**. |
| **Invitations** | Generate invitation codes per course with an optional expiry date and maximum number of uses. Revoke codes at any time. Codes are 12 characters from an unambiguous alphabet (no `0/O`, `1/I/L`) and are stored only as SHA-256 hashes. |
| **Members** | See who joined each course, suspend or remove students, and open a student's full history. |
| **Exam builder** | MCQ-only, written (CQ)-only or mixed exams. Set total marks, pass mark, duration, opening/closing window, number of attempts, question/option shuffling, negative marking per question, and result-release rules. |
| **Questions** | MCQ with 2–10 options and one correct answer; CQ with optional sub-questions (a, b, c…) whose marks add up to the question's marks. Questions can include an image. Explanations, model answers and rubrics are private. |
| **Question import** | Upload a PDF or photos of a question paper. Text is extracted (PDF text layer on the server, OCR in the browser for images), split into draft questions, and **every draft must be reviewed** before it is added to a draft exam. |
| **Exam lifecycle** | Draft → Published → Closed → Archived. Publishing is blocked until question marks add up to the total. Published exams are frozen; duplicate an exam to revise it. |
| **Grading** | MCQs are graded automatically on the server. For written answers, open each attempt, view the uploaded pages, annotate them (tick, cross, numbered comments, highlights, arrows) and award marks per question/sub-question. |
| **Return for correction** | Optionally send a graded written attempt back so the student can upload corrected sheets before a new deadline. |
| **Answer-key correction** | If an MCQ key was wrong after publishing, correct it with an audited action that regrades every attempt. |
| **Results and analytics** | Per-exam score distribution, averages, pass rate, per-question difficulty, and CSV export. Release results immediately, after the exam closes, or manually. |
| **Activity signals** | Attempts record tab-switch / focus-loss events as a best-effort integrity signal. |

### For students

| Area | What you can do |
| --- | --- |
| **Sign up and join** | Create an account, verify the email, then join a course with the invitation code from the teacher. |
| **Exams** | See upcoming, live and finished exams. Read the instructions, start an attempt, and watch a server-synchronised countdown. |
| **Autosave** | Answers are saved automatically and in order; an offline indicator appears if the connection drops and saving resumes when it returns. |
| **Written answers** | Upload photos or PDFs of handwritten answer sheets while the attempt is open. |
| **Results** | See score, per-question marks, teacher annotations and feedback once results are released. Correct answers and explanations appear only if the teacher enables it and the exam has closed for everyone. |
| **Study notes** | Private notes with file attachments, visible only to the student who wrote them. |
| **Settings** | Update name and timezone (all exam times are shown in the user's timezone). |

---

## 2. How it works — teacher and student workflows

### Teacher, start to finish

1. **Create a course** → *Courses → New course*. Add subjects and chapters on the course page.
2. **Invite students** → course page → *Invites* tab → *Create invite*. Copy the code (it is shown **once**) and share it with your students.
3. **Create an exam** → *Exams → New exam*. Fill in basics, format and scoring, timing, and result settings.
4. **Add questions** → on the exam page, *Add question*, or *Import* to extract questions from a PDF/photos and review the drafts.
5. **Publish** → when question marks equal the total marks, click *Publish*. Students in the course see it from the opening time.
6. **Monitor and grade** → *Grading* lists attempts that need attention. MCQ parts are already scored; grade written parts and finalise.
7. **Release results** → depending on the exam's setting, results appear immediately, after the exam closes, or when you click *Release results*.
8. **Analyse** → *Results* shows analytics per exam and lets you export a CSV.

### Student, start to finish

1. **Sign up** at `/signup`, open the confirmation email and click *Confirm email*.
2. **Join a course** → *Join course* → paste the invitation code.
3. **Take an exam** → *Exams* → open a live exam → *Start exam*. The timer starts on the server; answers save automatically.
4. **Upload written answers** (CQ exams) → photograph each page and upload before time runs out.
5. **Submit** → or let the timer finish; the attempt is submitted automatically at the deadline.
6. **View results** → *Results*, once the teacher releases them.

### What happens when time runs out?

Each attempt has a server-side `deadline_at = least(start time + duration, exam closing time)`. Saves arriving after the deadline (plus a 5-second network grace period) are rejected and the attempt is finalised and graded. Abandoned attempts are finalised by a scheduled job every minute, and also lazily whenever someone touches the attempt — so a closed browser tab never leaves an attempt open.

---

## 3. Architecture

```
Browser (React, client components)
   │  forms, timers, autosave queue, OCR (Tesseract.js)
   ▼
Next.js 16 on Vercel
   ├─ proxy.ts ............ refreshes the Supabase session cookie, redirects signed-out users
   ├─ Server Components ... read data with the user's session (RLS applies)
   ├─ Server Actions ...... validate input with Zod, call Postgres functions (RPCs)
   └─ Route handlers ...... /auth/confirm (email links), /api/results (CSV)
   │
   ▼  publishable key + user JWT only — no secret key at runtime
Supabase
   ├─ Auth ................ email + password, email confirmation, password reset
   ├─ Postgres ............ tables with RLS, SECURITY DEFINER business functions, triggers
   ├─ Storage ............. four private buckets with path-based policies
   └─ pg_cron ............. finalises expired attempts every minute
```

Key principles:

- **The database is the security boundary.** Every rule (who can see what, timing, grading, immutability) is enforced in Postgres via RLS, triggers and functions, so a bug in the UI cannot leak data.
- **No secret key in the app.** The app uses only the publishable key plus the signed-in user's JWT.
- **Server-authoritative timing and grading.** The browser never decides deadlines or scores.
- **Machine error codes.** Database functions raise codes such as `exam_not_open`; [src/lib/errors.ts](src/lib/errors.ts) maps them to friendly messages. Raw SQL errors never reach the browser.

### Data model (main tables)

| Table | Purpose |
| --- | --- |
| `profiles` | One row per user: name, timezone, role (`teacher` / `student`). |
| `courses`, `subjects`, `chapters` | Course structure. |
| `course_invites` | Hashed invitation codes with expiry, max uses and revocation. |
| `course_members` | Student ↔ course membership (`active`, `suspended`, `removed`). |
| `exams`, `exam_chapters` | Exam settings and the chapters it covers. |
| `questions`, `question_options`, `question_parts` | Question content visible to students during an attempt. |
| `question_answer_keys` | Correct options, explanations, model answers, rubrics — **teacher-only**. |
| `question_sources` | Uploaded PDFs/images used for question import. |
| `exam_attempts` | One row per attempt, with server deadline, status and revision counter. |
| `student_answers`, `answer_files` | Saved MCQ choices / text answers and uploaded answer sheets. |
| `grades`, `answer_annotations` | Per-question marks, feedback and drawn annotations. |
| `attempt_results` | Final scores — hidden from the student until release. |
| `attempt_events` | Tab-switch / focus events (rate-limited). |
| `study_notes`, `study_files` | Private student notes and attachments. |
| `audit_logs` | Records sensitive teacher actions (e.g. answer-key corrections). |

---

## 4. Project structure

```
.
├── src/
│   ├── app/                      # Routes (App Router)
│   │   ├── (auth)/               # login, signup, forgot/reset password, auth error — glass design
│   │   ├── auth/confirm/         # handles links from confirmation / reset emails
│   │   ├── teacher/              # teacher area: courses, exams, grading, results, students, sources
│   │   ├── student/              # student area: courses, exams, attempts, results, notes, join
│   │   ├── api/results/          # CSV export
│   │   ├── setup/                # shown when environment variables are missing
│   │   ├── icon.svg, apple-icon.tsx, opengraph-image.tsx   # favicon, home-screen icon, social image
│   │   ├── robots.ts, sitemap.ts, manifest.ts              # SEO and installable-app metadata
│   │   └── page.tsx              # landing page
│   ├── features/                 # feature modules: actions (server), queries (server), components
│   │   ├── auth/ courses/ exams/ attempts/ grading/ sources/ notes/ students/ settings/
│   ├── components/
│   │   ├── ui/                   # buttons, inputs, dialogs, tabs, badges…
│   │   ├── shared/               # app shell, navigation, user menu, page header, empty states
│   │   ├── tables/data-table.tsx # reusable sortable/filterable/paginated table
│   │   └── forms/                # server-action helper for forms
│   ├── lib/
│   │   ├── supabase/             # browser, server and proxy clients
│   │   ├── auth/dal.ts           # verified session + role lookup
│   │   ├── validations/          # Zod schemas (shared by forms and server actions)
│   │   ├── utils/                # dates/timezones, CSV, invite codes, file checks
│   │   └── errors.ts             # database error code → user message
│   │   └── seo.ts                # site name, description and URL used in metadata
│   ├── types/database.ts         # generated Supabase types
│   └── proxy.ts                  # session refresh + route protection
├── supabase/
│   ├── migrations/               # SQL schema, RLS, functions, storage, cron
│   ├── templates/                # branded HTML auth emails
│   ├── tests/                    # database / RLS test suite
│   └── config.toml               # Supabase CLI config (auth URLs, email templates)
├── scripts/                      # DB test runner, type generation, email template builder
└── .env.local.example            # template for your local environment file
```

---

## 5. Prerequisites

- **Node.js 20.9+** (Node 22 LTS recommended) and npm.
- A **Supabase project** (the free tier is fine to start).
- Optional: **PostgreSQL 15+** binaries locally (`initdb`, `pg_ctl`) to run the database test suite.
- Optional: a **Vercel** account for deployment.

---

## 6. Local setup

```bash
git clone https://github.com/imamhossenbu/exam-management.git
cd exam-management
npm install
cp .env.local.example .env.local   # then fill in the values (see §7)
npm run dev                         # http://localhost:3000
```

Then, in order:

1. Apply the database migrations (§8).
2. Configure Auth URLs and email templates (§9).
3. Sign up with the teacher's email and promote it (§10).

If the Supabase variables are missing or still contain placeholders, every page redirects to `/setup`, which explains what to fix without revealing any values.

---

## 7. Environment variables

| Variable | Required | Where it's used |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Browser + server. Dashboard → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Browser + server. Dashboard → Project Settings → API Keys → *Publishable key*. Safe to expose: every query is constrained by RLS. |
| `NEXT_SITE_URL` | recommended | Absolute origin used in auth email links, canonical URLs, the sitemap and social share images, e.g. `https://exams.example.com` (no trailing slash). `NEXT_PUBLIC_SITE_URL` is also supported as fallback. On Vercel it falls back to the production domain if unset. |
| `SUPABASE_SECRET_KEY` | required for Nodemailer OTP | Supabase `service_role` secret (Dashboard → Project Settings → API Keys). Enables generating 6-digit OTPs and sending branded emails via Nodemailer without relying on Supabase's built-in mailer. Never prefix with `NEXT_PUBLIC_`. |
| `SMTP_USER` & `SMTP_PASS` | yes (if using Nodemailer) | Gmail or SMTP credentials for sending auth OTPs and exam emails. |
| `DATABASE_URL` | no | Only for running migrations from your machine. Never used at runtime. |
| `SUPABASE_JWKS_URL` | no | Not needed: `supabase.auth.getClaims()` verifies JWTs against the project's JWKS automatically. |

`.env*` files are git-ignored (except `.env.local.example`). Check with `git check-ignore .env.local` — it should print the path.

---

## 8. Database and migrations

Migrations live in `supabase/migrations/` and are applied in filename order:

| File | Contents |
| --- | --- |
| `…000100_core_schema.sql` | Tables, enums, constraints, indexes |
| `…000200_security_rls.sql` | Authorization helpers, invariant triggers, **RLS policies**, least-privilege grants |
| `…000300_business_rpcs.sql` | Invitations, exam lifecycle, attempts, autosave, submission, MCQ + CQ grading |
| `…000400_storage.sql` | Private buckets and storage policies |
| `…000500_scheduled_jobs.sql` | pg_cron job that finalises abandoned attempts |
| `…000600_question_editing.sql` | Transactional `save_question` / `set_exam_chapters` |

**Option A — Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # the ID in your project URL
npx supabase db push
```

**Option B — SQL editor:** paste each file, in order, into Dashboard → SQL Editor and run it.

**Scheduled finalisation:** enable the *pg_cron* extension (Dashboard → Database → Extensions) **before** running `…000500`, or re-run that file afterwards. Correctness does not depend on it — expired attempts are also finalised whenever a student saves, submits or reopens the exam, or the teacher opens attempt lists — but the job grades abandoned attempts promptly.

**Changing the schema:** add a new migration file (never edit an applied one), then regenerate types:

```bash
npm run db:types        # uses a disposable local Postgres
# or
npx supabase gen types typescript --linked > src/types/database.ts
```

---

## 9. Supabase Auth and email templates

### URLs and email confirmation

`supabase/config.toml` already contains the auth settings. Adjust `site_url` and `additional_redirect_urls` for your domains, then push:

```bash
npx supabase config push
```

Review the diff it prints before confirming. Or set it by hand in the Dashboard:

1. **Authentication → URL Configuration**
   - *Site URL*: your app URL (`http://localhost:3000` locally, your Vercel domain in production).
   - *Redirect URLs*: `http://localhost:3000/auth/confirm` and `https://<your-domain>/auth/confirm`.
2. **Authentication → Providers → Email**: enable email sign-in and keep **Confirm email** on.

### Branded email templates

`supabase/templates/` contains five designed, mobile-friendly HTML emails (confirm signup, reset password, magic link, email change, invite). `config push` uploads them with these subjects:

| Template | Subject |
| --- | --- |
| Confirm signup | Confirm your ExamDesk account |
| Reset password | Reset your ExamDesk password |
| Magic link | Your ExamDesk sign-in link |
| Change email | Confirm your new ExamDesk email |
| Invite | You're invited to ExamDesk |

Links use the token-hash form so they work in any browser, e.g.:

- Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/student`
- Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

To change the design, edit `scripts/build-email-templates.py`, run `python3 scripts/build-email-templates.py`, and push again.

### Production email

Supabase's built-in sender is heavily rate-limited (a few emails per hour). For real use, configure **custom SMTP** (Authentication → SMTP Settings) with a provider such as Resend, Postmark, Brevo or Amazon SES.

Public sign-up only ever creates **student** accounts — a database trigger assigns the role and ignores anything sent by the browser.

---

## 10. Provision the teacher

The system has exactly **one** teacher, created once by an administrator:

1. Sign up through the app with the teacher's email and confirm it.
2. In Dashboard → SQL Editor run:

   ```sql
   select app_private.promote_to_teacher('teacher@example.com');
   ```

3. Sign out and sign back in — you now land on `/teacher`.

`promote_to_teacher` is not callable through the API. A unique index guarantees there is only one teacher; to hand over, demote the current one first from the SQL editor:

```sql
update public.profiles set role = 'student' where id = '<current-teacher-user-id>';
```

---

## 11. File storage

The storage migration creates four **private** buckets with size and type limits, plus policies that tie every object path to database state:

| Bucket | Max size | Types | Path | Access |
| --- | --- | --- | --- | --- |
| `question-assets` | 5 MB | PNG, JPEG, WebP | `{exam_id}/…` | Teacher manages; a student may read an image only after starting that exam *and* only if a question references it |
| `question-sources` | 20 MB | PDF, PNG, JPEG, WebP | `{teacher_id}/…` | Teacher only |
| `answer-sheets` | 10 MB | PDF, PNG, JPEG, WebP | `{student_id}/{attempt_id}/…` | Student uploads/deletes only while the attempt is open; student and teacher can read |
| `study-files` | 10 MB | PDF, PNG, JPEG, WebP | `{student_id}/{note_id}/…` | Owner only |

Files are served through short-lived signed URLs. No Dashboard steps are needed unless you skipped the migration. Sizes are checked in the browser (for a clear message) and enforced again by Supabase.

---

## 12. Deploying to Vercel

1. Push this repository to GitHub and **import** it in Vercel (framework preset: Next.js; default build settings).
2. Under *Settings → Environment Variables*, add for **Production** and **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_SITE_URL` = your production URL, e.g. `https://exam-management-sable.vercel.app`
   - `SUPABASE_SECRET_KEY` = your Supabase `service_role` secret (Project Settings → API Keys)
   - `SMTP_USER` & `SMTP_PASS` = your Gmail and App Password for Nodemailer
3. Deploy.
4. In Supabase, set the *Site URL* to `https://exam-management-sable.vercel.app` and add `https://exam-management-sable.vercel.app/auth/confirm` to *Redirect URLs* (§9).
5. Provision the teacher if you haven't already (§10).

No secrets are needed at runtime; the app only uses the publishable key and the signed-in user's session. Every push to `main` redeploys automatically.

---

## 13. Development commands and tests

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Unit tests (validation, timezone conversion, invite codes, autosave queue, question parser, analytics, CSV) |
| `npm run test:db` | Database / RLS suite (see below) |
| `npm run test:e2e` | End-to-end browser test against your Supabase project (see below) |
| `npm run db:types` | Regenerates `src/types/database.ts` from the migrations |

### Database test suite

`npm run test:db` starts a throwaway local PostgreSQL 15+ (`initdb`/`pg_ctl` on `PATH`, or set `PG_BIN=/path/to/bin`), applies every migration on top of minimal Supabase stubs, and tests policies and functions as different users. It covers:

- role escalation and the single-teacher rule
- anonymous access, course visibility and student isolation (attempts, notes, uploads)
- invitation validation (expired / revoked / full / suspended) and brute-force rate limiting
- answer-key secrecy and question visibility before an attempt starts
- attempt limits, server deadlines, auto-finalisation and autosave revision ordering
- duplicate / concurrent starts and submissions
- negative marking, result release (immediate / after close / manual)
- CQ grading permissions and validation, answer-key correction with regrading
- storage policies

### End-to-end test

`npm run test:e2e` drives a real browser (Playwright) through the whole product against your linked Supabase project:

1. Public pages, route protection, `robots.txt` / `sitemap.xml`.
2. Auth forms: wrong password, validation errors, password strength meter, forgot-password (no account enumeration).
3. Teacher creates a course and an invitation code (only its hash is stored).
4. Two temporary students join with the code; a wrong code is rejected.
5. Teacher builds a mixed exam (MCQ with negative marking + written question) and publishes it.
6. Student A answers correctly and uploads/removes answer-sheet pages; student B answers wrongly. Second attempts are blocked.
7. Students can't open teacher pages or each other's results.
8. MCQs are graded on the server (2 and −0.5).
9. Teacher grades the written answers, finalizes and publishes results.
10. Students see the right scores (4.5/5 Passed, 0.5/5 Not passed).
11. Sign out from the user menu.

**Setup (once):**

```bash
cp .env.e2e.example .env.e2e.local   # git-ignored; put the teacher's email and password here
npx playwright install chromium
npx supabase login && npx supabase link --project-ref <your-project-ref>
```

**Run:** start the app (`npm run dev`, or `npm run build && npx next start` for a faster, production-like run with `E2E_BASE_URL=http://localhost:3000`), then `npm run test:e2e`.

Temporary students (`e2e-…@example.com`) are created already confirmed through SQL, so no emails are sent. Everything the test creates ("E2E …" courses and exams, students, attempts, uploads) is deleted afterwards and the teardown verifies nothing is left. Set `E2E_KEEP_DATA=1` to keep the data for inspection. Reports and traces of failures are written to `.tmp/e2e-report`.

Before opening a pull request, run: `npm run typecheck && npm run lint && npm test && npm run build`.

---

## 14. Security model

- **Identity** comes from verified JWTs (`getClaims()`); the **role** is read from the database, never from the client.
- **Every table has RLS.** `anon` has no table access; `authenticated` gets only the columns it needs (e.g. students can update their name/timezone, never their role).
- **Business writes go through `SECURITY DEFINER` functions** that re-check the caller and the rules: students cannot insert attempts, answers, grades or results directly.
- **Answer keys, explanations and rubrics** live in `question_answer_keys` (teacher-only). Students receive them only through `get_released_answer_keys()`, which returns nothing until results are released *and* the exam window has closed for everyone.
- **Results are hidden** (`attempt_results` RLS) until the release rule allows them.
- **Timing is server-authoritative:** saves after the deadline plus a 5-second grace are rejected and the attempt is finalised.
- **Published exams are immutable** (triggers). Revise by duplicating; fix a wrong MCQ key with the audited *Correct key* action.
- **Invitation codes** are hashed (SHA-256) and never stored in plain text. After 8 failed join attempts in 15 minutes, joining is locked the user out temporarily.
- **Attempt events** are rate-limited (120 per 10 minutes) to prevent flooding.
- **Errors** shown to users are mapped from machine codes; SQL text is never returned to the browser.
- Tab-switch logging is a **best-effort signal**. A web app cannot prevent tab switching, screenshots, other devices or outside help.

### Credential checklist

- [ ] Never commit `.env.local` (it is git-ignored).
- [ ] Store production values only in Vercel's environment settings.
- [ ] Never put `SUPABASE_SECRET_KEY` or `DATABASE_URL` in a `NEXT_PUBLIC_*` variable — the app doesn't need either.
- [ ] Rotate any key or database password that was ever shared outside the Supabase Dashboard (chat, ticket, screenshot), then revoke the old one.

---

## 15. Troubleshooting

| Problem | Fix |
| --- | --- |
| Every page redirects to `/setup` | `.env.local` is missing or still has placeholder values. Fill it in and restart `npm run dev`. |
| New styles/changes don't appear | Stop the dev server, run `rm -rf .next`, start `npm run dev` again, and hard-refresh the browser (`Cmd/Ctrl + Shift + R`). |
| Confirmation email never arrives | Check spam. The built-in Supabase sender is rate-limited — wait or configure custom SMTP (§9). Check Dashboard → Authentication → Logs. |
| Email link opens "This link has expired" | Links are single-use and expire. Request a new one. Make sure `/auth/confirm` is in *Redirect URLs* and *Site URL* matches the app's domain. |
| Signed in but see the student area as the teacher | Run `promote_to_teacher` (§10), then sign out and in again. |
| "Only one teacher" error when promoting | Demote the existing teacher first (§10). |
| Can't publish an exam | Question marks must add up exactly to the total marks, and the exam needs at least one question. |
| Students don't see an exam | Check it's published, the opening time has passed (in the teacher's timezone), and the student is an active member of the course. |
| Students don't see results | Check the exam's release rule; for *Manual* click *Release results*; for *After close* wait until the window ends. |
| Upload fails | Check the file type and size limits (§11) and that the attempt is still open. |
| Attempts aren't auto-submitted after time | Enable pg_cron and re-run `…000500_scheduled_jobs.sql`. Attempts are still finalised when anyone next touches them. |
| `npm run test:db` says `pg_ctl not found` | Install PostgreSQL 15+ (e.g. `brew install postgresql@16`) or set `PG_BIN`. |

---

## 16. SEO and social sharing

- **Metadata:** every page has a title (`Page · ExamDesk`); the root layout sets the description, keywords, Open Graph and Twitter cards. Edit the name/description in [src/lib/seo.ts](src/lib/seo.ts).
- **Favicon and icons:** `src/app/icon.svg` (browser tab) and `src/app/apple-icon.tsx` (iOS home screen) use the ExamDesk logo.
- **Social share image:** `src/app/opengraph-image.tsx` generates a 1200×630 preview used when the link is shared on Facebook, WhatsApp, LinkedIn, X, etc.
- **Indexing:** `/robots.txt` and `/sitemap.xml` expose only the public pages (home, sign in, sign up). The teacher and student areas, auth callbacks, API routes and password-reset pages are marked `noindex` and disallowed.
- **Structured data:** the landing page includes JSON-LD (`WebApplication`) for richer search results.
- **Canonical URLs** use `NEXT_SITE_URL` (or `NEXT_PUBLIC_SITE_URL`), so set it to your real domain in production.
- After deploying, submit `https://<domain>/sitemap.xml` in Google Search Console.

## 17. Design decisions and limitations

- **Question import:** PDF text layers are extracted on the server (`unpdf`). Images are OCR'd **in the teacher's browser** with Tesseract.js (serverless functions are a poor fit for OCR), which downloads its English model on first use. Scanned PDFs without a text layer are reported as such; upload page photos or type the text instead. Extracted questions are drafts and never published automatically.
- **Annotations:** images support ticks, crosses, numbered comments, highlights and arrows, stored separately in normalised coordinates so the original file is never modified. PDFs are shown in the browser's viewer with page-referenced comments.
- **Scoring:** negative marking can reduce an MCQ score, but an attempt's total never goes below 0.
- **Single teacher:** the system is intentionally built for one teacher. Multiple teachers would need changes to the unique index and RLS helpers.
- **Lists** load up to 2,000 attempts / 500 notes and paginate client-side — ample for a single teacher.
- **Design:** one light theme for the app; the sign-in screens use a fixed glass design.
- **End-to-end tests** run against a real Supabase project (`npm run test:e2e`); the database rules are also covered in isolation by `npm run test:db`.
