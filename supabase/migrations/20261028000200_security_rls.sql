-- =============================================================================
-- Authorization helpers, triggers that protect invariants, RLS and grants.
--
-- Helpers live in app_private (not exposed through the Data API) and are
-- SECURITY DEFINER so that policies can consult other tables without
-- recursive RLS evaluation. Every helper pins search_path.
-- =============================================================================

grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function app_private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;

create or replace function app_private.owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    join public.profiles p on p.id = c.teacher_id and p.role = 'teacher'
    where c.id = p_course_id and c.teacher_id = (select auth.uid())
  );
$$;

create or replace function app_private.owns_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    join public.courses c on c.id = e.course_id
    join public.profiles p on p.id = c.teacher_id and p.role = 'teacher'
    where e.id = p_exam_id and c.teacher_id = (select auth.uid())
  );
$$;

create or replace function app_private.owns_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.questions q
    where q.id = p_question_id and app_private.owns_exam(q.exam_id)
  );
$$;

create or replace function app_private.teaches_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id and app_private.owns_exam(a.exam_id)
  );
$$;

create or replace function app_private.is_active_member(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_members m
    where m.course_id = p_course_id
      and m.student_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function app_private.has_attempt(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exam_attempts a
    where a.exam_id = p_exam_id and a.student_id = (select auth.uid())
  );
$$;

-- A student may see an exam's metadata when it is published/closed in a course
-- they actively belong to, or when they already have an attempt on it.
create or replace function app_private.student_can_view_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    where e.id = p_exam_id
      and (
        (e.status in ('published', 'closed') and app_private.is_active_member(e.course_id))
        or app_private.has_attempt(e.id)
      )
  );
$$;

-- Students may read question content only once they have started an attempt.
create or replace function app_private.student_can_view_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.questions q
    where q.id = p_question_id and app_private.has_attempt(q.exam_id)
  );
$$;

create or replace function app_private.owns_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id and a.student_id = (select auth.uid())
  );
$$;

-- Result visibility for an attempt (no auth check; callers combine with ownership).
create or replace function app_private.results_visible(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_attempts a
    join public.exams e on e.id = a.exam_id
    join public.attempt_results r on r.attempt_id = a.id
    where a.id = p_attempt_id
      and a.status = 'submitted'
      and r.grading_status = 'graded'
      and (
        e.results_published_at is not null
        or e.results_release = 'immediate'
        or (e.results_release = 'after_close' and (now() >= e.ends_at or e.status in ('closed', 'archived')))
      )
  );
$$;

-- Correct answers are revealed only with visible results, when the teacher
-- allows it, and never while the exam window is still open for anyone.
create or replace function app_private.answers_revealed(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.results_visible(p_attempt_id)
    and exists (
      select 1 from public.exam_attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = p_attempt_id
        and e.reveal_answers
        and (now() >= e.ends_at or e.status in ('closed', 'archived'))
        and not exists (
          select 1 from public.exam_attempts o
          where o.exam_id = e.id and o.status = 'in_progress' and o.deadline_at > now()
        )
    );
$$;

create or replace function app_private.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Fixed-window rate limiter. Returns true when the call is allowed.
create or replace function app_private.check_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_window timestamptz;
  v_hits integer;
begin
  if v_uid is null then
    return false;
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into app_private.rate_limits as rl (user_id, action, window_start, hits)
  values (v_uid, p_action, v_window, 1)
  on conflict (user_id, action, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of old windows for this user/action.
  delete from app_private.rate_limits
  where user_id = v_uid and action = p_action and window_start < now() - interval '1 day';
  return v_hits <= p_max;
end;
$$;

revoke all on all functions in schema app_private from public;
grant execute on function
  app_private.try_uuid(text),
  app_private.is_teacher(),
  app_private.owns_course(uuid),
  app_private.owns_exam(uuid),
  app_private.owns_question(uuid),
  app_private.teaches_attempt(uuid),
  app_private.is_active_member(uuid),
  app_private.has_attempt(uuid),
  app_private.student_can_view_exam(uuid),
  app_private.student_can_view_question(uuid),
  app_private.owns_attempt(uuid),
  app_private.results_visible(uuid),
  app_private.answers_revealed(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- New user provisioning: every signup becomes a STUDENT. Role from client
-- metadata is ignored. Teachers are provisioned with promote_to_teacher().
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'student',
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 120),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app_private.sync_user_email();

-- Guard: role can never change through the API, and timezone must be valid.
create or replace function app_private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'PROFILE_ID_IMMUTABLE' using errcode = '42501';
  end if;
  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function app_private.guard_profile_update();

-- Administrative teacher provisioning. Not executable by API roles.
-- Run from the Supabase SQL editor:  select app_private.promote_to_teacher('you@example.com');
create or replace function app_private.promote_to_teacher(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No profile found for %. The user must sign up (and confirm) first.', p_email;
  end if;
  if exists (select 1 from public.profiles where role = 'teacher' and id <> v_id) then
    raise exception 'A teacher already exists. This platform supports exactly one teacher.';
  end if;
  update public.profiles set role = 'teacher' where id = v_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (null, 'teacher.provisioned', 'profile', v_id, jsonb_build_object('email', p_email));
  return v_id;
end;
$$;
revoke all on function app_private.promote_to_teacher(text) from public, authenticated;

-- Courses must belong to the teacher.
create or replace function app_private.guard_course_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.teacher_id and role = 'teacher') then
    raise exception 'COURSE_OWNER_MUST_BE_TEACHER' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.teacher_id is distinct from old.teacher_id then
    raise exception 'COURSE_OWNER_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger courses_guard before insert or update on public.courses
  for each row execute function app_private.guard_course_owner();

-- Exam content can only be changed while the exam is a draft (and therefore
-- has no attempts). Published exams are immutable; duplicate to revise.
create or replace function app_private.exam_is_editable(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.exams where id = p_exam_id and status = 'draft')
     and not exists (select 1 from public.exam_attempts where exam_id = p_exam_id);
$$;

create or replace function app_private.guard_exam_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam_id uuid;
  v_row record;
begin
  -- Trusted maintenance paths (e.g. answer-key correction) set this flag.
  if coalesce(current_setting('app.allow_locked_edit', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_row := coalesce(new, old);
  if tg_table_name = 'questions' then
    v_exam_id := v_row.exam_id;
  else
    select q.exam_id into v_exam_id from public.questions q where q.id = v_row.question_id;
    -- Parent question already removed in the same cascade.
    if v_exam_id is null then
      return coalesce(new, old);
    end if;
  end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.exams where id = v_exam_id) then
    return old;
  end if;

  if not app_private.exam_is_editable(v_exam_id) then
    raise exception 'EXAM_LOCKED' using errcode = 'P0001';
  end if;
  -- Nested IFs: PL/pgSQL does not short-circuit AND, and only questions has exam_id.
  if tg_table_name = 'questions' and tg_op = 'UPDATE' then
    if new.exam_id is distinct from old.exam_id then
      raise exception 'QUESTION_EXAM_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger questions_guard before insert or update or delete on public.questions
  for each row execute function app_private.guard_exam_content();
create trigger question_parts_guard before insert or update or delete on public.question_parts
  for each row execute function app_private.guard_exam_content();
create trigger question_options_guard before insert or update or delete on public.question_options
  for each row execute function app_private.guard_exam_content();
create trigger question_answer_keys_guard before insert or update or delete on public.question_answer_keys
  for each row execute function app_private.guard_exam_content();

-- Scoring-relevant exam settings are frozen once attempts exist.
create or replace function app_private.guard_exam_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.course_id is distinct from old.course_id then
    raise exception 'EXAM_COURSE_IMMUTABLE' using errcode = 'P0001';
  end if;
  if old.status <> 'draft' or exists (select 1 from public.exam_attempts where exam_id = old.id) then
    if new.exam_type is distinct from old.exam_type
       or new.total_marks is distinct from old.total_marks
       or new.duration_minutes is distinct from old.duration_minutes
       or new.shuffle_questions is distinct from old.shuffle_questions
       or new.shuffle_options is distinct from old.shuffle_options
       or new.max_attempts < old.max_attempts
       or (new.starts_at is distinct from old.starts_at and old.starts_at <= now()) then
      raise exception 'EXAM_SETTINGS_LOCKED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger exams_guard before update on public.exams
  for each row execute function app_private.guard_exam_update();

-- Exams with attempts can never be deleted; drafts only.
create or replace function app_private.guard_exam_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'EXAM_NOT_DELETABLE' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger exams_guard_delete before delete on public.exams
  for each row execute function app_private.guard_exam_delete();

-- Audit membership changes.
create or replace function app_private.audit_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.write_audit('enrollment.created', 'course_member', new.id,
      jsonb_build_object('course_id', new.course_id, 'student_id', new.student_id, 'status', new.status));
  elsif new.status is distinct from old.status then
    perform app_private.write_audit('enrollment.status_changed', 'course_member', new.id,
      jsonb_build_object('course_id', new.course_id, 'student_id', new.student_id, 'from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
create trigger course_members_audit after insert or update on public.course_members
  for each row execute function app_private.audit_membership();

-- Members may only change status; identity columns are immutable.
create or replace function app_private.guard_membership_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.course_id is distinct from old.course_id or new.student_id is distinct from old.student_id then
    raise exception 'MEMBERSHIP_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger course_members_guard before update on public.course_members
  for each row execute function app_private.guard_membership_update();

-- Study files must point at a note owned by the same user.
create or replace function app_private.guard_study_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.study_notes where id = new.note_id and owner_id = new.owner_id) then
    raise exception 'NOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.owner_id::text then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger study_files_guard before insert or update on public.study_files
  for each row execute function app_private.guard_study_file();

create or replace function app_private.guard_question_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if split_part(new.storage_path, '/', 1) <> new.teacher_id::text then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '42501';
  end if;
  if new.course_id is not null and not exists (
    select 1 from public.courses where id = new.course_id and teacher_id = new.teacher_id) then
    raise exception 'COURSE_NOT_FOUND' using errcode = '42501';
  end if;
  if new.exam_id is not null and not exists (
    select 1 from public.exams e join public.courses c on c.id = e.course_id
    where e.id = new.exam_id and c.teacher_id = new.teacher_id) then
    raise exception 'EXAM_NOT_FOUND' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger question_sources_guard before insert or update on public.question_sources
  for each row execute function app_private.guard_question_source();

-- Taxonomy integrity: chapters linked to an exam must belong to the exam's course.
create or replace function app_private.guard_exam_chapter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.chapters ch
    join public.subjects s on s.id = ch.subject_id
    join public.exams e on e.course_id = s.course_id
    where ch.id = new.chapter_id and e.id = new.exam_id
  ) then
    raise exception 'CHAPTER_NOT_IN_COURSE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger exam_chapters_guard before insert or update on public.exam_chapters
  for each row execute function app_private.guard_exam_chapter();

create or replace function app_private.guard_exam_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_id is not null and not exists (
    select 1 from public.subjects where id = new.subject_id and course_id = new.course_id) then
    raise exception 'SUBJECT_NOT_IN_COURSE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger exams_subject_guard before insert or update of subject_id, course_id on public.exams
  for each row execute function app_private.guard_exam_subject();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;
alter table public.course_invites enable row level security;
alter table public.course_members enable row level security;
alter table public.question_sources enable row level security;
alter table public.exams enable row level security;
alter table public.exam_chapters enable row level security;
alter table public.questions enable row level security;
alter table public.question_parts enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.attempt_results enable row level security;
alter table public.student_answers enable row level security;
alter table public.answer_files enable row level security;
alter table public.attempt_events enable row level security;
alter table public.grades enable row level security;
alter table public.answer_annotations enable row level security;
alter table public.study_notes enable row level security;
alter table public.study_files enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_teacher on public.profiles for select to authenticated
  using ((select app_private.is_teacher()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- courses
create policy courses_teacher_all on public.courses for all to authenticated
  using (teacher_id = (select auth.uid()) and (select app_private.is_teacher()))
  with check (teacher_id = (select auth.uid()) and (select app_private.is_teacher()));
create policy courses_student_select on public.courses for select to authenticated
  using (app_private.is_active_member(id));

-- subjects / chapters
create policy subjects_teacher_all on public.subjects for all to authenticated
  using (app_private.owns_course(course_id)) with check (app_private.owns_course(course_id));
create policy subjects_student_select on public.subjects for select to authenticated
  using (app_private.is_active_member(course_id));

create policy chapters_teacher_all on public.chapters for all to authenticated
  using (exists (select 1 from public.subjects s where s.id = subject_id and app_private.owns_course(s.course_id)))
  with check (exists (select 1 from public.subjects s where s.id = subject_id and app_private.owns_course(s.course_id)));
create policy chapters_student_select on public.chapters for select to authenticated
  using (exists (select 1 from public.subjects s where s.id = subject_id and app_private.is_active_member(s.course_id)));

-- invites: teacher only. Students redeem through redeem_course_invite().
create policy course_invites_teacher_all on public.course_invites for all to authenticated
  using (app_private.owns_course(course_id))
  with check (app_private.owns_course(course_id) and created_by = (select auth.uid()));

-- memberships
create policy course_members_teacher_all on public.course_members for all to authenticated
  using (app_private.owns_course(course_id)) with check (app_private.owns_course(course_id));
create policy course_members_student_select on public.course_members for select to authenticated
  using (student_id = (select auth.uid()));

-- question sources: teacher only
create policy question_sources_teacher_all on public.question_sources for all to authenticated
  using (teacher_id = (select auth.uid()) and (select app_private.is_teacher()))
  with check (teacher_id = (select auth.uid()) and (select app_private.is_teacher()));

-- exams
create policy exams_teacher_all on public.exams for all to authenticated
  using (app_private.owns_course(course_id)) with check (app_private.owns_course(course_id));
create policy exams_student_select on public.exams for select to authenticated
  using (app_private.student_can_view_exam(id));

create policy exam_chapters_teacher_all on public.exam_chapters for all to authenticated
  using (app_private.owns_exam(exam_id)) with check (app_private.owns_exam(exam_id));
create policy exam_chapters_student_select on public.exam_chapters for select to authenticated
  using (app_private.student_can_view_exam(exam_id));

-- questions / parts / options
create policy questions_teacher_all on public.questions for all to authenticated
  using (app_private.owns_exam(exam_id)) with check (app_private.owns_exam(exam_id));
create policy questions_student_select on public.questions for select to authenticated
  using (app_private.has_attempt(exam_id));

create policy question_parts_teacher_all on public.question_parts for all to authenticated
  using (app_private.owns_question(question_id)) with check (app_private.owns_question(question_id));
create policy question_parts_student_select on public.question_parts for select to authenticated
  using (app_private.student_can_view_question(question_id));

create policy question_options_teacher_all on public.question_options for all to authenticated
  using (app_private.owns_question(question_id)) with check (app_private.owns_question(question_id));
create policy question_options_student_select on public.question_options for select to authenticated
  using (app_private.student_can_view_question(question_id));

-- answer keys: teacher only. Released keys are served by get_released_answer_keys().
create policy question_answer_keys_teacher_all on public.question_answer_keys for all to authenticated
  using (app_private.owns_question(question_id)) with check (app_private.owns_question(question_id));

-- attempts
create policy exam_attempts_teacher_select on public.exam_attempts for select to authenticated
  using (app_private.owns_exam(exam_id));
create policy exam_attempts_student_select on public.exam_attempts for select to authenticated
  using (student_id = (select auth.uid()));

create policy attempt_results_teacher_select on public.attempt_results for select to authenticated
  using (app_private.teaches_attempt(attempt_id));
create policy attempt_results_student_select on public.attempt_results for select to authenticated
  using (app_private.owns_attempt(attempt_id) and app_private.results_visible(attempt_id));

create policy student_answers_teacher_select on public.student_answers for select to authenticated
  using (app_private.teaches_attempt(attempt_id));
create policy student_answers_student_select on public.student_answers for select to authenticated
  using (app_private.owns_attempt(attempt_id));

create policy answer_files_teacher_select on public.answer_files for select to authenticated
  using (app_private.teaches_attempt(attempt_id));
create policy answer_files_student_select on public.answer_files for select to authenticated
  using (app_private.owns_attempt(attempt_id));

create policy attempt_events_teacher_select on public.attempt_events for select to authenticated
  using (app_private.teaches_attempt(attempt_id));

-- grades: teacher reads all for their exams; students read FINAL grades once released.
create policy grades_teacher_select on public.grades for select to authenticated
  using (app_private.teaches_attempt(attempt_id));
create policy grades_student_select on public.grades for select to authenticated
  using (status = 'final' and app_private.owns_attempt(attempt_id) and app_private.results_visible(attempt_id));

create policy answer_annotations_teacher_all on public.answer_annotations for all to authenticated
  using (app_private.teaches_attempt(attempt_id))
  with check (
    app_private.teaches_attempt(attempt_id)
    and created_by = (select auth.uid())
    and exists (select 1 from public.answer_files f where f.id = answer_file_id and f.attempt_id = answer_annotations.attempt_id)
  );
create policy answer_annotations_student_select on public.answer_annotations for select to authenticated
  using (app_private.owns_attempt(attempt_id) and app_private.results_visible(attempt_id));

-- notes: strictly owner-only (the teacher cannot read students' notes).
create policy study_notes_owner_all on public.study_notes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy study_files_owner_all on public.study_files for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy audit_logs_teacher_select on public.audit_logs for select to authenticated
  using ((select app_private.is_teacher()));

-- ---------------------------------------------------------------------------
-- Grants (least privilege; anon gets nothing). Writes that carry business
-- rules (attempts, answers, grades, status changes) go through RPCs only.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, timezone) on public.profiles to authenticated;

grant select, insert, delete on public.courses to authenticated;
grant update (title, code, description, archived_at) on public.courses to authenticated;

grant select, insert, update, delete on public.subjects, public.chapters to authenticated;

grant select, insert on public.course_invites to authenticated;
grant update (revoked_at, label) on public.course_invites to authenticated;

grant select, insert on public.course_members to authenticated;
grant update (status) on public.course_members to authenticated;

grant select, insert, delete on public.question_sources to authenticated;
grant update (course_id, subject_id, chapter_id, exam_id, extraction_status, extracted_text, extraction_error)
  on public.question_sources to authenticated;

grant select, insert, delete on public.exams to authenticated;
grant update (
  subject_id, title, description, instructions, exam_type, total_marks, pass_marks,
  duration_minutes, starts_at, ends_at, max_attempts, shuffle_questions, shuffle_options,
  results_release, reveal_answers, allow_resubmission
) on public.exams to authenticated;

grant select, insert, delete on public.exam_chapters to authenticated;
grant select, insert, update, delete on public.questions, public.question_parts, public.question_options,
  public.question_answer_keys to authenticated;

grant select on public.exam_attempts, public.attempt_results, public.student_answers,
  public.answer_files, public.attempt_events, public.grades to authenticated;

grant select, insert, update, delete on public.answer_annotations to authenticated;
grant select, insert, update, delete on public.study_notes to authenticated;
grant select, insert, delete on public.study_files to authenticated;
grant select on public.audit_logs to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;
