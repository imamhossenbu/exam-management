-- =============================================================================
-- Extra time for individual students (accommodations, missed exams, outages).
--
-- Two tools for the teacher, both per student and audited:
--   * reopen_attempt(): reopen a submitted attempt with N more minutes. The
--     student continues with their saved answers (all questions open; a timed
--     MCQ section no longer applies), then submits again.
--   * grant_late_start(): let a student who couldn't take the exam start one
--     attempt inside a personal window — even after the exam has ended, been
--     closed, or their attempts are used up. Used once.
--
-- Fairness: answer keys stay hidden from everyone while any extension is
-- still open (reopened attempt in progress, or an unused late window).
-- Attempts taken or finished with extra time are marked (extended_at).
-- =============================================================================

alter table public.exam_attempts
  add column extended_at timestamptz,
  add column extended_by uuid references public.profiles (id) on delete set null,
  add column extension_note text check (extension_note is null or char_length(extension_note) <= 500);

comment on column public.exam_attempts.extended_at is 'Set when the attempt was reopened or started with extra time granted by the teacher.';

create table public.exam_extensions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500),
  used_at timestamptz,
  attempt_id uuid references public.exam_attempts (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- At most one live (unused, not revoked) late window per student and exam.
create unique index exam_extensions_one_open on public.exam_extensions (exam_id, student_id)
  where used_at is null and revoked_at is null;
create index exam_extensions_exam_idx on public.exam_extensions (exam_id);

alter table public.exam_extensions enable row level security;
create policy exam_extensions_teacher_select on public.exam_extensions for select to authenticated
  using (app_private.owns_exam(exam_id));
create policy exam_extensions_student_select on public.exam_extensions for select to authenticated
  using (student_id = (select auth.uid()));
grant select on public.exam_extensions to authenticated;

-- An unused late window that hasn't closed yet (it may not have opened yet).
create or replace function app_private.open_extension(p_exam_id uuid, p_student_id uuid)
returns public.exam_extensions
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.exam_extensions x
  where x.exam_id = p_exam_id and x.student_id = p_student_id
    and x.used_at is null and x.revoked_at is null and x.ends_at > now()
  order by x.created_at desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Answer keys wait for every extension too.
-- -----------------------------------------------------------------------------
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
          where o.exam_id = e.id and o.status = 'in_progress'
            and o.deadline_at + app_private.save_grace() > now()
        )
        and not exists (
          select 1 from public.exam_extensions x
          where x.exam_id = e.id and x.used_at is null and x.revoked_at is null and x.ends_at > now()
        )
    );
$$;

-- -----------------------------------------------------------------------------
-- Teacher: reopen a submitted attempt with extra minutes.
-- -----------------------------------------------------------------------------
create or replace function public.reopen_attempt(p_attempt_id uuid, p_minutes integer, p_note text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_teacher();
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_deadline timestamptz;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or not app_private.owns_exam(v_attempt.exam_id) then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select e.* into v_exam from public.exams e where e.id = v_attempt.exam_id;
  if v_exam.status = 'archived' then
    raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'INVALID_EXTENSION' using errcode = '22023';
  end if;
  -- One open attempt per student and exam.
  if exists (select 1 from public.exam_attempts where exam_id = v_attempt.exam_id and student_id = v_attempt.student_id and status = 'in_progress') then
    raise exception 'ATTEMPT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  v_deadline := now() + make_interval(mins => p_minutes);
  update public.exam_attempts set
    status = 'in_progress', submitted_at = null, submitted_via = null,
    deadline_at = v_deadline,
    -- The extra time covers every question; a timed MCQ section no longer applies.
    mcq_deadline_at = null, mcq_handed_in_at = null,
    extended_at = now(), extended_by = v_uid, extension_note = nullif(trim(p_note), '')
  where id = p_attempt_id;
  -- Answers may change: written marks go back to drafts; MCQs are regraded on submission.
  update public.grades set status = 'draft' where attempt_id = p_attempt_id and not is_auto;
  perform app_private.recompute_result(p_attempt_id);
  perform app_private.write_audit('attempt.reopened', 'exam_attempt', p_attempt_id,
    jsonb_build_object('minutes', p_minutes, 'deadline_at', v_deadline));
  return v_deadline;
end;
$$;

-- -----------------------------------------------------------------------------
-- Teacher: a personal late window for one student; revoke it.
-- -----------------------------------------------------------------------------
create or replace function public.grant_late_start(
  p_exam_id uuid, p_student_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_teacher();
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
  v_id uuid;
begin
  if v_exam.status not in ('published', 'closed') then
    raise exception 'EXAM_NOT_PUBLISHED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.course_members where course_id = v_exam.course_id and student_id = p_student_id and status = 'active') then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at <= now()
     or p_ends_at - p_starts_at > interval '30 days' then
    raise exception 'INVALID_DEADLINE' using errcode = '22023';
  end if;
  -- A new grant replaces an unused one.
  update public.exam_extensions set revoked_at = now()
  where exam_id = p_exam_id and student_id = p_student_id and used_at is null and revoked_at is null;
  insert into public.exam_extensions (exam_id, student_id, starts_at, ends_at, note, created_by)
  values (p_exam_id, p_student_id, p_starts_at, p_ends_at, nullif(trim(p_note), ''), v_uid)
  returning id into v_id;
  perform app_private.write_audit('extension.granted', 'exam', p_exam_id,
    jsonb_build_object('student_id', p_student_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_id;
end;
$$;

create or replace function public.revoke_extension(p_extension_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x public.exam_extensions;
begin
  perform app_private.require_teacher();
  select x.* into v_x from public.exam_extensions x where x.id = p_extension_id for update;
  if v_x.id is null or not app_private.owns_exam(v_x.exam_id) then
    raise exception 'EXTENSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_x.used_at is null and v_x.revoked_at is null then
    update public.exam_extensions set revoked_at = now() where id = p_extension_id;
    perform app_private.write_audit('extension.revoked', 'exam', v_x.exam_id, jsonb_build_object('student_id', v_x.student_id));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Student start: the normal rules, or a live late window.
-- -----------------------------------------------------------------------------
create or replace function public.start_attempt(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_exam public.exams;
  v_open public.exam_attempts;
  v_ext public.exam_extensions;
  v_late boolean := false;
  v_used integer;
  v_order uuid[];
  v_opt_order jsonb;
  v_deadline timestamptz;
  v_finalized uuid;
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Serialize concurrent starts for this student/exam pair.
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text || ':' || v_uid::text, 0));

  select e.* into v_exam from public.exams e where e.id = p_exam_id;
  if v_exam.id is null or not app_private.is_active_member(v_exam.course_id) then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Finalize this student's expired attempt (if any) before counting.
  for v_open in
    select a.* from public.exam_attempts a
    where a.exam_id = p_exam_id and a.student_id = v_uid and a.status = 'in_progress'
    for update
  loop
    if v_open.deadline_at + app_private.save_grace() < now() then
      perform app_private.finalize_attempt(v_open.id, 'timeout');
      v_finalized := v_open.id;
    else
      return v_open.id; -- resume the open attempt
    end if;
  end loop;

  select count(*) into v_used from public.exam_attempts where exam_id = p_exam_id and student_id = v_uid;

  if v_exam.status <> 'published' or now() < v_exam.starts_at or now() >= v_exam.ends_at or v_used >= v_exam.max_attempts then
    -- Outside the normal rules: a teacher-granted late window may still allow one attempt.
    v_ext := app_private.open_extension(p_exam_id, v_uid);
    if v_ext.id is not null and now() >= v_ext.starts_at and v_exam.status in ('published', 'closed') then
      v_late := true;
    else
      if v_finalized is not null then return v_finalized; end if;
      if v_exam.status <> 'published' then raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001'; end if;
      if now() < v_exam.starts_at then raise exception 'EXAM_NOT_STARTED' using errcode = 'P0001'; end if;
      if now() >= v_exam.ends_at then raise exception 'EXAM_ENDED' using errcode = 'P0001'; end if;
      raise exception 'ATTEMPT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  -- Sectioned exams keep every MCQ before every CQ; shuffling happens within each section.
  select array_agg(id order by
      case when v_exam.mcq_duration_minutes is not null and type = 'cq' then 1 else 0 end,
      case when v_exam.shuffle_questions then random() else position end,
      id)
  into v_order from public.questions where exam_id = p_exam_id;

  if v_order is null then
    raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_object_agg(question_id, ids), '{}'::jsonb) into v_opt_order
  from (
    select o.question_id,
      jsonb_agg(o.id order by case when v_exam.shuffle_options then random() else o.position end, o.id) as ids
    from public.question_options o
    join public.questions q on q.id = o.question_id
    where q.exam_id = p_exam_id
    group by o.question_id
  ) s;

  v_deadline := least(now() + make_interval(mins => v_exam.duration_minutes), case when v_late then v_ext.ends_at else v_exam.ends_at end);

  insert into public.exam_attempts (
    exam_id, student_id, attempt_number, deadline_at, mcq_deadline_at, question_order, option_order,
    extended_at, extended_by, extension_note)
  values (
    p_exam_id, v_uid, v_used + 1,
    v_deadline,
    case when v_exam.mcq_duration_minutes is null then null
         else least(now() + make_interval(mins => v_exam.mcq_duration_minutes), v_deadline) end,
    v_order, v_opt_order,
    case when v_late then now() end, case when v_late then v_ext.created_by end, case when v_late then v_ext.note end)
  returning id into v_id;

  if v_late then
    update public.exam_extensions set used_at = now(), attempt_id = v_id where id = v_ext.id;
  end if;
  perform app_private.write_audit('attempt.started', 'exam_attempt', v_id, jsonb_build_object('exam_id', p_exam_id, 'late', v_late));
  return v_id;
end;
$$;

-- Changing the exam's end time doesn't cut teacher-granted extra time short.
create or replace function app_private.sync_exam_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_deadline timestamptz;
begin
  if new.ends_at is distinct from old.ends_at then
    for r in
      -- Attempts with teacher-granted extra time keep their own deadline.
      select * from public.exam_attempts where exam_id = new.id and status = 'in_progress' and extended_at is null for update
    loop
      v_deadline := greatest(
        least(r.started_at + make_interval(mins => new.duration_minutes), new.ends_at),
        r.started_at + interval '1 second');
      update public.exam_attempts set
        deadline_at = v_deadline,
        mcq_deadline_at = case
          when r.mcq_deadline_at is null then null
          -- Section ended on its own or was handed in: keep it (capped by the new deadline).
          when r.mcq_deadline_at < r.deadline_at then least(r.mcq_deadline_at, v_deadline)
          -- Section was capped by the old deadline: recompute from the section length.
          else least(r.started_at + make_interval(mins => coalesce(new.mcq_duration_minutes, 0)), v_deadline)
        end
      where id = r.id;
    end loop;
  end if;

  if new.pass_marks is distinct from old.pass_marks then
    for r in
      select a.id from public.exam_attempts a
      join public.attempt_results ar on ar.attempt_id = a.id
      where a.exam_id = new.id and a.status <> 'in_progress'
    loop
      perform app_private.recompute_result(r.id);
    end loop;
  end if;
  return null;
end;
$$;

-- What the student's exam page needs to offer a late attempt.
create or replace function public.my_late_window(p_exam_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.starts_at, x.ends_at, x.note
  from app_private.open_extension(p_exam_id, (select auth.uid())) x
  where x.id is not null;
$$;

revoke all on function public.reopen_attempt(uuid, integer, text), public.grant_late_start(uuid, uuid, timestamptz, timestamptz, text),
  public.revoke_extension(uuid), public.my_late_window(uuid) from public, anon;
grant execute on function public.reopen_attempt(uuid, integer, text), public.grant_late_start(uuid, uuid, timestamptz, timestamptz, text),
  public.revoke_extension(uuid), public.my_late_window(uuid) to authenticated;
