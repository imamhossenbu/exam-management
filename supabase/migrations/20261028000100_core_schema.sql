-- =============================================================================
-- Online Exam Management System — core schema
-- One teacher, their courses, and their enrolled students.
--
-- Retention rules:
--   * Courses are archived, never hard-deleted by the app.
--   * Exams with attempts cannot be deleted (FK RESTRICT from exam_attempts).
--   * Attempts, answers, grades and results are historical records and are never
--     removed by cascades from questions/options (RESTRICT).
-- =============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('teacher', 'student');
create type public.membership_status as enum ('active', 'suspended', 'removed');
create type public.exam_type as enum ('mcq', 'cq', 'mixed');
create type public.exam_status as enum ('draft', 'published', 'closed', 'archived');
create type public.results_release as enum ('immediate', 'after_close', 'manual');
create type public.question_type as enum ('mcq', 'cq');
create type public.attempt_status as enum ('in_progress', 'submitted', 'returned');
create type public.submission_method as enum ('student', 'timeout', 'teacher');
create type public.grading_status as enum ('pending', 'in_review', 'graded');
create type public.grade_status as enum ('draft', 'final');
create type public.extraction_status as enum ('pending', 'extracted', 'failed', 'manual');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Passwords live only in auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 320),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one teacher may exist on the platform.
create unique index profiles_single_teacher on public.profiles (role) where role = 'teacher';
create index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Courses and taxonomy
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 2 and 120),
  code text check (code is null or char_length(code) <= 30),
  description text not null default '' check (char_length(description) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_teacher_idx on public.courses (teacher_id);
create trigger courses_updated_at before update on public.courses
  for each row execute function app_private.set_updated_at();

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index subjects_course_name_uniq on public.subjects (course_id, lower(name));

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index chapters_subject_name_uniq on public.chapters (subject_id, lower(name));
create index chapters_subject_idx on public.chapters (subject_id, position);

-- ---------------------------------------------------------------------------
-- Enrollment and invitations
-- ---------------------------------------------------------------------------
create table public.course_invites (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  -- Only a SHA-256 hash of the code is stored; the plaintext is shown once.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null check (char_length(code_hint) between 2 and 8),
  label text check (label is null or char_length(label) <= 80),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 10000),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (max_uses is null or use_count <= max_uses)
);
create index course_invites_course_idx on public.course_invites (course_id);

create table public.course_members (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  status public.membership_status not null default 'active',
  invite_id uuid references public.course_invites (id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, student_id)
);
create index course_members_student_idx on public.course_members (student_id);
create trigger course_members_updated_at before update on public.course_members
  for each row execute function app_private.set_updated_at();

-- Brute-force protection for invitation codes.
create table app_private.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_time_idx on app_private.invite_attempts (user_id, attempted_at desc);

-- Generic fixed-window rate limiting.
create table app_private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);

-- ---------------------------------------------------------------------------
-- Question sources (uploaded PDFs / images used for importing questions)
-- ---------------------------------------------------------------------------
create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid references public.courses (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  chapter_id uuid references public.chapters (id) on delete set null,
  exam_id uuid,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  extraction_status public.extraction_status not null default 'pending',
  extracted_text text check (extracted_text is null or char_length(extracted_text) <= 200000),
  extraction_error text check (extraction_error is null or char_length(extraction_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index question_sources_teacher_idx on public.question_sources (teacher_id, created_at desc);
create trigger question_sources_updated_at before update on public.question_sources
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Exams and questions
-- ---------------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 2 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  instructions text not null default '' check (char_length(instructions) <= 8000),
  exam_type public.exam_type not null,
  total_marks numeric(7, 2) not null check (total_marks > 0 and total_marks <= 10000),
  pass_marks numeric(7, 2) check (pass_marks is null or (pass_marks >= 0 and pass_marks <= total_marks)),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_attempts integer not null default 1 check (max_attempts between 1 and 20),
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  results_release public.results_release not null default 'after_close',
  -- Reveal correct answers / explanations with results. Never before the exam window ends.
  reveal_answers boolean not null default true,
  -- Allow the teacher to return CQ work to a student for correction.
  allow_resubmission boolean not null default false,
  status public.exam_status not null default 'draft',
  published_at timestamptz,
  closed_at timestamptz,
  results_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index exams_course_idx on public.exams (course_id, starts_at desc);
create index exams_status_idx on public.exams (status, ends_at);
create trigger exams_updated_at before update on public.exams
  for each row execute function app_private.set_updated_at();

alter table public.question_sources
  add constraint question_sources_exam_fk foreign key (exam_id) references public.exams (id) on delete set null;

create table public.exam_chapters (
  exam_id uuid not null references public.exams (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  primary key (exam_id, chapter_id)
);
create index exam_chapters_chapter_idx on public.exam_chapters (chapter_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  type public.question_type not null,
  position integer not null default 0,
  body text not null check (char_length(body) between 1 and 10000),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  marks numeric(6, 2) not null check (marks > 0 and marks <= 1000),
  negative_marks numeric(6, 2) not null default 0 check (negative_marks >= 0 and negative_marks <= marks),
  source_id uuid references public.question_sources (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = 'mcq' or negative_marks = 0)
);
create index questions_exam_idx on public.questions (exam_id, position);
create trigger questions_updated_at before update on public.questions
  for each row execute function app_private.set_updated_at();

-- CQ sub-questions with their own marks.
create table public.question_parts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 10),
  body text not null check (char_length(body) between 1 and 5000),
  marks numeric(6, 2) not null check (marks > 0 and marks <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index question_parts_question_idx on public.question_parts (question_id, position);

-- MCQ options. Correctness is deliberately NOT stored here.
create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, question_id)
);
create index question_options_question_idx on public.question_options (question_id, position);

-- Private answer keys, explanations and rubrics. Teacher-only via RLS.
create table public.question_answer_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_option_id uuid,
  explanation text check (explanation is null or char_length(explanation) <= 10000),
  model_answer text check (model_answer is null or char_length(model_answer) <= 20000),
  rubric text check (rubric is null or char_length(rubric) <= 20000),
  updated_at timestamptz not null default now(),
  foreign key (correct_option_id, question_id)
    references public.question_options (id, question_id) on delete set null (correct_option_id)
);
create trigger question_answer_keys_updated_at before update on public.question_answer_keys
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Attempts, answers, uploads
-- ---------------------------------------------------------------------------
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  attempt_number integer not null check (attempt_number >= 1),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  -- Authoritative server deadline: least(started_at + duration, exam.ends_at).
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  submitted_via public.submission_method,
  question_order uuid[] not null,
  option_order jsonb not null default '{}'::jsonb,
  returned_at timestamptz,
  return_note text check (return_note is null or char_length(return_note) <= 2000),
  resubmit_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id, attempt_number),
  check (deadline_at > started_at),
  check (status = 'in_progress' or submitted_at is not null)
);
-- At most one open attempt per student per exam (concurrency guard).
create unique index exam_attempts_one_open on public.exam_attempts (exam_id, student_id) where status = 'in_progress';
create index exam_attempts_student_idx on public.exam_attempts (student_id, started_at desc);
create index exam_attempts_open_deadline_idx on public.exam_attempts (deadline_at) where status = 'in_progress';
create trigger exam_attempts_updated_at before update on public.exam_attempts
  for each row execute function app_private.set_updated_at();

create table public.attempt_results (
  attempt_id uuid primary key references public.exam_attempts (id) on delete restrict,
  mcq_score numeric(8, 2) not null default 0,
  cq_score numeric(8, 2) not null default 0,
  total_score numeric(8, 2) not null default 0,
  max_score numeric(8, 2) not null,
  percentage numeric(5, 2) not null default 0,
  passed boolean,
  grading_status public.grading_status not null default 'pending',
  graded_at timestamptz,
  graded_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger attempt_results_updated_at before update on public.attempt_results
  for each row execute function app_private.set_updated_at();

create table public.student_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  question_id uuid not null references public.questions (id) on delete restrict,
  selected_option_id uuid references public.question_options (id) on delete restrict,
  text_answer text check (text_answer is null or char_length(text_answer) <= 20000),
  marked_for_review boolean not null default false,
  -- Monotonic client revision; stale (out-of-order) autosaves are ignored.
  revision integer not null default 0 check (revision >= 0),
  saved_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index student_answers_question_idx on public.student_answers (question_id);

create table public.answer_files (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  question_id uuid not null references public.questions (id) on delete restrict,
  part_id uuid references public.question_parts (id) on delete restrict,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  page_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index answer_files_attempt_idx on public.answer_files (attempt_id, question_id, page_order);

-- Best-effort integrity signals (tab switches etc.). Not proof of anything.
create table public.attempt_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  event_type text not null check (event_type in ('visibility_hidden', 'visibility_visible', 'window_blur', 'window_focus', 'went_offline', 'came_online')),
  occurred_at timestamptz not null default now()
);
create index attempt_events_attempt_idx on public.attempt_events (attempt_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  question_id uuid not null references public.questions (id) on delete restrict,
  part_id uuid references public.question_parts (id) on delete restrict,
  marks_awarded numeric(6, 2) not null,
  max_marks numeric(6, 2) not null check (max_marks > 0),
  is_auto boolean not null default false,
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  status public.grade_status not null default 'draft',
  graded_by uuid references public.profiles (id) on delete set null,
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (marks_awarded <= max_marks),
  check (is_auto or marks_awarded >= 0),
  constraint grades_unique_item unique nulls not distinct (attempt_id, question_id, part_id)
);
create index grades_attempt_idx on public.grades (attempt_id);
create trigger grades_updated_at before update on public.grades
  for each row execute function app_private.set_updated_at();

-- Annotations are stored separately from the original uploads.
-- Coordinates are normalised to the page (0..1) so they survive zoom levels.
create table public.answer_annotations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete restrict,
  answer_file_id uuid not null references public.answer_files (id) on delete cascade,
  page integer not null default 1 check (page >= 1),
  kind text not null check (kind in ('tick', 'cross', 'highlight', 'arrow', 'comment')),
  x numeric(6, 5) not null check (x between 0 and 1),
  y numeric(6, 5) not null check (y between 0 and 1),
  x2 numeric(6, 5) check (x2 is null or x2 between 0 and 1),
  y2 numeric(6, 5) check (y2 is null or y2 between 0 and 1),
  body text check (body is null or char_length(body) <= 1000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index answer_annotations_file_idx on public.answer_annotations (answer_file_id, page);
create index answer_annotations_attempt_idx on public.answer_annotations (attempt_id);

-- ---------------------------------------------------------------------------
-- Student personal notes
-- ---------------------------------------------------------------------------
create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  subject text not null default '' check (char_length(subject) <= 100),
  chapter text not null default '' check (char_length(chapter) <= 150),
  body text not null default '' check (char_length(body) <= 100000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_notes_owner_idx on public.study_notes (owner_id, updated_at desc);
create index study_notes_search_idx on public.study_notes using gin (search);
create index study_notes_tags_idx on public.study_notes using gin (tags);
create trigger study_notes_updated_at before update on public.study_notes
  for each row execute function app_private.set_updated_at();

create or replace function app_private.study_notes_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search :=
    setweight(to_tsvector('simple'::regconfig, coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(new.subject, '') || ' ' || coalesce(new.chapter, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, array_to_string(new.tags, ' ')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(new.body, '')), 'C');
  return new;
end;
$$;
create trigger study_notes_search before insert or update of title, subject, chapter, body, tags
  on public.study_notes for each row execute function app_private.study_notes_search_vector();

create table public.study_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.study_notes (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index study_files_note_idx on public.study_files (note_id);

-- ---------------------------------------------------------------------------
-- Audit log (written only by trusted functions / triggers)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
