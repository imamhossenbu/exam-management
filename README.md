# ExamDesk — Online Exam Management System

A private exam platform for **one teacher and their students**: courses with invitation codes, MCQ / written (CQ) / mixed exams, timed online attempts with autosave, automatic MCQ grading, handwritten answer uploads with teacher annotations, controlled result release, analytics with CSV export, and private study notes.

**Stack:** Next.js 16 (App Router, Cache Components, TypeScript strict) · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage, RLS) · React Hook Form + Zod · TanStack Table v9 · Sonner · Lucide · Vitest.

---

## 1. Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the values (see §2)
npm run dev                         # http://localhost:3000
```

If the Supabase variables are missing or still contain placeholders, every page redirects to `/setup`, which explains what to fix without revealing any values.

## 2. Environment variables

| Variable | Required | Where it's used |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Browser + server. Dashboard → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Browser + server. Dashboard → Project Settings → API Keys → *Publishable key*. Safe to expose: every query is constrained by RLS. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Absolute origin used in auth email links, e.g. `https://exams.example.com`. |
| `SUPABASE_SECRET_KEY` | **no** | Not used by the app. Leave empty. Never prefix with `NEXT_PUBLIC_`. |
| `DATABASE_URL` | no | Only for running migrations from your machine (Dashboard → **Connect**). Never used at runtime. |
| `SUPABASE_JWKS_URL` | no | Not needed: `supabase.auth.getClaims()` verifies JWTs against the project's JWKS automatically. |

`.env*` files are git-ignored (except the example). **Do not reuse any credential that was ever pasted into a chat, ticket or screenshot — rotate it first** (see §9).

## 3. Database: apply the migrations

Migrations live in `supabase/migrations/` and must be applied in order:

| File | Contents |
| --- | --- |
| `…000100_core_schema.sql` | Tables, enums, constraints, indexes |
| `…000200_security_rls.sql` | Authorization helpers, invariant triggers, **RLS policies**, least-privilege grants |
| `…000300_business_rpcs.sql` | Invitations, exam lifecycle, attempts, autosave, submission, MCQ + CQ grading |
| `…000400_storage.sql` | Private buckets and storage policies |
| `…000500_scheduled_jobs.sql` | pg_cron job that finalizes abandoned attempts (optional) |
| `…000600_question_editing.sql` | Transactional `save_question` / `set_exam_chapters` |

**Option A — Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref cazeweyqwlcmqyuwsrhq
npx supabase db push
```

**Option B — SQL editor:** paste each file, in order, into Dashboard → SQL Editor and run it.

**Scheduled finalization (recommended):** enable *pg_cron* (Dashboard → Database → Extensions) **before** running `…000500`, or re-run that file after enabling it. Correctness does not depend on it — expired attempts are also finalized whenever a student saves, submits, reopens the exam, or the teacher opens attempt lists — but the job grades abandoned attempts promptly.

Regenerate TypeScript types after changing SQL: `npm run db:types` (uses a disposable local Postgres), or `npx supabase gen types typescript --linked > src/types/database.ts`.

## 4. Supabase Auth configuration (Dashboard)

1. **Authentication → URL Configuration**
   - *Site URL*: your app URL (e.g. `http://localhost:3000` locally, your Vercel domain in production).
   - *Redirect URLs*: add `http://localhost:3000/auth/confirm` and `https://<your-domain>/auth/confirm`.
2. **Authentication → Providers → Email**: enable email sign-in and keep **Confirm email** on.
3. **Authentication → Email Templates**: replace the link in *Confirm signup* and *Reset password* with the token-hash form (copies are in `supabase/templates/`):
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/student`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   (The default `?code=` links also work but only in the browser that started the flow.)
4. For production email volume, configure custom SMTP (Authentication → SMTP Settings); the built-in sender is heavily rate-limited.

Public sign-up only ever creates **student** accounts — a database trigger assigns the role and ignores anything sent by the browser.

## 5. Provision the teacher (one-time, administrative)

1. Sign up through the app with the teacher's email and confirm it.
2. In Dashboard → SQL Editor run:

   ```sql
   select app_private.promote_to_teacher('teacher@example.com');
   ```

This function is not callable through the API. A unique index guarantees there is only ever **one** teacher; to hand over, demote first (`update public.profiles set role = 'student' where id = '…';` from the SQL editor).

## 6. Storage

The storage migration creates four **private** buckets with size and MIME limits, plus policies that tie every object path to database state:

| Bucket | Path | Access |
| --- | --- | --- |
| `question-assets` | `{exam_id}/…` | Teacher manages; a student may read an image only after starting that exam *and* only if a question references it |
| `question-sources` | `{teacher_id}/…` | Teacher only |
| `answer-sheets` | `{student_id}/{attempt_id}/…` | Student uploads/deletes only while the attempt is open; student and teacher can read |
| `study-files` | `{student_id}/{note_id}/…` | Owner only |

Files are served through short-lived signed URLs. No dashboard steps are needed unless you skipped the migration.

## 7. Deploying to Vercel

1. Import the repository in Vercel (framework: Next.js; defaults are fine).
2. Add the environment variables from §2 for *Production* and *Preview* (`NEXT_PUBLIC_SITE_URL` = the deployment URL).
3. Deploy, then add `https://<domain>/auth/confirm` to Supabase redirect URLs and set the Site URL (§4).
4. Provision the teacher (§5).

No secrets are needed at runtime; the app only uses the publishable key and the signed-in user's session.

## 8. Development commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Unit tests (validation, timezone conversion, invite codes, autosave queue, question parser, analytics, CSV) |
| `npm run test:db` | Database/RLS suite: starts a throwaway local PostgreSQL 15+ (`initdb`/`pg_ctl` on PATH or `PG_BIN=…`), applies every migration on top of minimal Supabase stubs, and tests policies and RPCs as different users |
| `npm run db:types` | Regenerates `src/types/database.ts` from the migrations |
| `npm run build` | Production build |

The database suite covers: role escalation, single-teacher rule, anonymous access, course visibility, invitation validation (expired/revoked/full/suspended), brute-force rate limiting, answer-key secrecy, question visibility before start, attempt limits, server deadlines and auto-finalization, autosave revision ordering, duplicate/concurrent starts and submissions, negative marking, result release (manual / after close), CQ grading permissions and validation, answer-key correction with regrading, student isolation for attempts/notes/uploads, and storage policies.

## 9. Security model and credential checklist

- **Identity** comes from verified JWTs (`getClaims()`); the **role** is read from the database, never from the client.
- **Every table has RLS.** `anon` has no table access; `authenticated` gets only the columns it needs (e.g. students can update their name/timezone, never their role).
- **Business writes go through `SECURITY DEFINER` functions** that re-check the caller and rules: students cannot insert attempts, answers, grades or results directly.
- **Answer keys, explanations and rubrics** live in `question_answer_keys` (teacher-only). Students receive them only through `get_released_answer_keys()`, which returns nothing until results are released *and* the exam window has closed for everyone.
- **Timing is server-authoritative:** each attempt's `deadline_at = least(start + duration, window end)`; saves after the deadline (plus a 5-second network grace) are rejected and the attempt is finalized.
- **Published exams are immutable** (triggers). Revise by duplicating; correct a wrong MCQ key with the audited *Correct key* action, which regrades all attempts.
- Errors shown to users are mapped from machine codes; SQL text is never returned to the browser.
- Tab-switch logging is a **best-effort signal**. A web app cannot prevent tab switching, screenshots, other devices or outside help.

**Credential rotation checklist**

- [ ] Rotate any key or database password that was ever shared outside the Supabase dashboard (API Keys → create new secret key / Database → reset password).
- [ ] Revoke the old secret keys once nothing uses them.
- [ ] Keep `.env.local` out of git (`git check-ignore .env.local` should print the path).
- [ ] Store production values only in Vercel's environment settings.
- [ ] Never put `SUPABASE_SECRET_KEY` or `DATABASE_URL` in a `NEXT_PUBLIC_*` variable.

## 10. Design decisions and limitations

- **Question import:** PDF text layers are extracted on the server (`unpdf`). Images are OCR'd **in the teacher's browser** with Tesseract.js (serverless functions are a poor fit for OCR), which downloads its English model on first use. Scanned PDFs without a text layer are reported as such; upload page photos or type the text instead. Extracted questions are drafts: each must be reviewed before it is added to a *draft* exam, and nothing is published automatically.
- **Annotations:** images support ticks, crosses, numbered comments, highlights and arrows (stored separately, in normalized coordinates). PDFs are shown in the browser's viewer with page-referenced comments.
- **Scoring:** question marks must add up to the exam total before publishing. Negative marking can reduce an MCQ score, but an attempt's total never goes below 0.
- **Lists** load up to 2,000 attempts / 500 notes and paginate client-side — ample for a single teacher.
- **End-to-end browser tests** are not included because they need a live Supabase project; the critical rules are covered at the database layer by `npm run test:db`.
