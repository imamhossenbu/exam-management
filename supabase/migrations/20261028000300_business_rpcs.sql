-- =============================================================================
-- Business operations exposed as RPCs. Each function:
--   * runs as SECURITY DEFINER with a pinned, empty search_path,
--   * re-validates the caller (auth.uid()), role, ownership and business rules,
--   * raises machine-readable error codes (mapped to friendly text in the app).
-- =============================================================================

-- Grace period that absorbs network latency for the final autosave.
create or replace function app_private.save_grace()
returns interval language sql immutable set search_path = '' as $$ select interval '5 seconds' $$;

create or replace function app_private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v uuid := (select auth.uid());
begin
  if v is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return v;
end;
$$;

create or replace function app_private.require_teacher()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v uuid := app_private.require_uid();
begin
  if not exists (select 1 from public.profiles where id = v and role = 'teacher') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function app_private.require_exam_owner(p_exam_id uuid)
returns public.exams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams;
begin
  perform app_private.require_teacher();
  select e.* into v_exam from public.exams e where e.id = p_exam_id;
  if v_exam.id is null or not app_private.owns_exam(p_exam_id) then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_exam;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
-- Returns a status instead of raising so that failed attempts are recorded
-- (raising would roll back the brute-force counter). Reveals only the course
-- title of a valid code, nothing else.
create or replace function public.redeem_course_invite(p_code text)
returns table (status text, course_id uuid, course_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_role public.app_role;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text;
  v_invite public.course_invites;
  v_course public.courses;
  v_member public.course_members;
  v_failures integer;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then
    return query select 'not_a_student'::text, null::uuid, null::text;
    return;
  end if;

  select count(*) into v_failures from app_private.invite_attempts
  where user_id = v_uid and not succeeded and attempted_at > now() - interval '15 minutes';
  if v_failures >= 8 then
    return query select 'rate_limited'::text, null::uuid, null::text;
    return;
  end if;

  if char_length(v_code) < 8 or char_length(v_code) > 32 then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, false);
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  v_hash := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
  select i.* into v_invite from public.course_invites i where i.code_hash = v_hash for update;

  if v_invite.id is null
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, false);
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  select c.* into v_course from public.courses c where c.id = v_invite.course_id;
  if v_course.archived_at is not null then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, false);
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  select m.* into v_member from public.course_members m
  where m.course_id = v_course.id and m.student_id = v_uid for update;

  if v_member.id is not null and v_member.status = 'active' then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, true);
    return query select 'already_enrolled'::text, v_course.id, v_course.title;
    return;
  end if;
  if v_member.id is not null and v_member.status = 'suspended' then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, true);
    return query select 'suspended'::text, null::uuid, null::text;
    return;
  end if;

  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, false);
    return query select 'full'::text, null::uuid, null::text;
    return;
  end if;

  if v_member.id is null then
    insert into public.course_members (course_id, student_id, status, invite_id)
    values (v_course.id, v_uid, 'active', v_invite.id);
  else
    update public.course_members set status = 'active', invite_id = v_invite.id where id = v_member.id;
  end if;

  update public.course_invites set use_count = use_count + 1 where id = v_invite.id;
  insert into app_private.invite_attempts (user_id, succeeded) values (v_uid, true);
  return query select 'joined'::text, v_course.id, v_course.title;
end;
$$;

-- Teacher enrolls an existing student account by email.
create or replace function public.enroll_student_by_email(p_course_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.profiles;
  v_member public.course_members;
begin
  perform app_private.require_teacher();
  if not app_private.owns_course(p_course_id) then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select p.* into v_student from public.profiles p where lower(p.email) = lower(trim(p_email));
  if v_student.id is null or v_student.role <> 'student' then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select m.* into v_member from public.course_members m
  where m.course_id = p_course_id and m.student_id = v_student.id for update;
  if v_member.id is not null and v_member.status = 'active' then
    return 'already_enrolled';
  end if;
  if v_member.id is null then
    insert into public.course_members (course_id, student_id, status) values (p_course_id, v_student.id, 'active');
  else
    update public.course_members set status = 'active' where id = v_member.id;
  end if;
  return 'enrolled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Exam lifecycle
-- ---------------------------------------------------------------------------
-- Returns a list of validation problems; empty means publishable.
create or replace function public.validate_exam_for_publish(p_exam_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
  v_problems text[] := '{}';
  v_sum numeric;
  v_count integer;
  r record;
begin
  select count(*), coalesce(sum(marks), 0) into v_count, v_sum from public.questions where exam_id = p_exam_id;
  if v_count = 0 then
    v_problems := v_problems || 'The exam has no questions.';
  end if;
  if v_sum <> v_exam.total_marks then
    v_problems := v_problems || format('Question marks add up to %s but the exam total is %s.', v_sum, v_exam.total_marks);
  end if;
  if v_exam.exam_type = 'mcq' and exists (select 1 from public.questions where exam_id = p_exam_id and type = 'cq') then
    v_problems := v_problems || 'An MCQ exam cannot contain written (CQ) questions.';
  end if;
  if v_exam.exam_type = 'cq' and exists (select 1 from public.questions where exam_id = p_exam_id and type = 'mcq') then
    v_problems := v_problems || 'A CQ exam cannot contain MCQ questions.';
  end if;
  if v_exam.ends_at <= now() then
    v_problems := v_problems || 'The exam end time is in the past.';
  end if;
  if v_exam.ends_at - v_exam.starts_at < make_interval(mins => 1) then
    v_problems := v_problems || 'The exam window is too short.';
  end if;

  for r in
    select q.position, q.type, q.marks, q.id,
      (select count(*) from public.question_options o where o.question_id = q.id) as option_count,
      (select k.correct_option_id from public.question_answer_keys k where k.question_id = q.id) as correct_id,
      (select count(*) from public.question_parts p where p.question_id = q.id) as part_count,
      (select coalesce(sum(p.marks), 0) from public.question_parts p where p.question_id = q.id) as part_sum
    from public.questions q where q.exam_id = p_exam_id order by q.position
  loop
    if r.type = 'mcq' then
      if r.option_count < 2 then
        v_problems := v_problems || format('Question %s needs at least two options.', r.position + 1);
      end if;
      if r.correct_id is null then
        v_problems := v_problems || format('Question %s has no correct option selected.', r.position + 1);
      end if;
    elsif r.part_count > 0 and r.part_sum <> r.marks then
      v_problems := v_problems || format('Question %s: sub-question marks (%s) do not equal the question marks (%s).', r.position + 1, r.part_sum, r.marks);
    end if;
  end loop;

  return v_problems;
end;
$$;

create or replace function public.publish_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
  v_problems text[];
begin
  if v_exam.status <> 'draft' then
    raise exception 'EXAM_NOT_DRAFT' using errcode = 'P0001';
  end if;
  v_problems := public.validate_exam_for_publish(p_exam_id);
  if cardinality(v_problems) > 0 then
    raise exception 'EXAM_INVALID' using errcode = 'P0001', detail = array_to_string(v_problems, E'\n');
  end if;
  update public.exams set status = 'published', published_at = now() where id = p_exam_id;
  perform app_private.write_audit('exam.published', 'exam', p_exam_id);
end;
$$;

create or replace function public.unpublish_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
begin
  if v_exam.status <> 'published' then
    raise exception 'EXAM_NOT_PUBLISHED' using errcode = 'P0001';
  end if;
  perform 1 from public.exams where id = p_exam_id for update;
  if exists (select 1 from public.exam_attempts where exam_id = p_exam_id) then
    raise exception 'EXAM_HAS_ATTEMPTS' using errcode = 'P0001';
  end if;
  update public.exams set status = 'draft', published_at = null where id = p_exam_id;
  perform app_private.write_audit('exam.unpublished', 'exam', p_exam_id);
end;
$$;

create or replace function public.archive_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
begin
  if v_exam.status = 'published' and v_exam.ends_at > now() then
    raise exception 'EXAM_STILL_OPEN' using errcode = 'P0001';
  end if;
  update public.exams set status = 'archived' where id = p_exam_id;
  perform app_private.write_audit('exam.archived', 'exam', p_exam_id);
end;
$$;

create or replace function public.restore_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
begin
  if v_exam.status <> 'archived' then
    raise exception 'EXAM_NOT_ARCHIVED' using errcode = 'P0001';
  end if;
  update public.exams
  set status = case when published_at is null then 'draft'::public.exam_status else 'closed'::public.exam_status end
  where id = p_exam_id;
  perform app_private.write_audit('exam.restored', 'exam', p_exam_id);
end;
$$;

create or replace function public.publish_results(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
begin
  if v_exam.status = 'draft' then
    raise exception 'EXAM_NOT_PUBLISHED' using errcode = 'P0001';
  end if;
  update public.exams set results_published_at = now() where id = p_exam_id;
  perform app_private.write_audit('results.published', 'exam', p_exam_id);
end;
$$;

create or replace function public.unpublish_results(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_exam_owner(p_exam_id);
  update public.exams set results_published_at = null where id = p_exam_id;
  perform app_private.write_audit('results.unpublished', 'exam', p_exam_id);
end;
$$;

-- Atomically reorder questions of a draft exam.
create or replace function public.reorder_questions(p_exam_id uuid, p_question_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform app_private.require_exam_owner(p_exam_id);
  select count(*) into v_count from public.questions where exam_id = p_exam_id;
  if v_count <> cardinality(p_question_ids)
     or exists (select 1 from unnest(p_question_ids) as x(id)
                where not exists (select 1 from public.questions q where q.id = x.id and q.exam_id = p_exam_id)) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  update public.questions q set position = o.ord - 1
  from unnest(p_question_ids) with ordinality as o(id, ord)
  where q.id = o.id;
end;
$$;

-- Duplicate a question (with options, parts, key) inside a draft exam.
create or replace function public.duplicate_question(p_question_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.questions;
  v_new uuid;
  v_key public.question_answer_keys;
  v_new_correct uuid;
  r record;
  v_new_opt uuid;
begin
  select q.* into v_q from public.questions q where q.id = p_question_id;
  if v_q.id is null then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app_private.require_exam_owner(v_q.exam_id);

  update public.questions set position = position + 1 where exam_id = v_q.exam_id and position > v_q.position;
  insert into public.questions (exam_id, type, position, body, image_path, marks, negative_marks, source_id)
  values (v_q.exam_id, v_q.type, v_q.position + 1, v_q.body, v_q.image_path, v_q.marks, v_q.negative_marks, v_q.source_id)
  returning id into v_new;

  select k.* into v_key from public.question_answer_keys k where k.question_id = p_question_id;
  for r in select * from public.question_options where question_id = p_question_id order by position loop
    insert into public.question_options (question_id, body, image_path, position)
    values (v_new, r.body, r.image_path, r.position) returning id into v_new_opt;
    if r.id = v_key.correct_option_id then
      v_new_correct := v_new_opt;
    end if;
  end loop;
  insert into public.question_parts (question_id, label, body, marks, position)
  select v_new, label, body, marks, position from public.question_parts where question_id = p_question_id;
  if v_key.question_id is not null then
    insert into public.question_answer_keys (question_id, correct_option_id, explanation, model_answer, rubric)
    values (v_new, v_new_correct, v_key.explanation, v_key.model_answer, v_key.rubric);
  end if;
  return v_new;
end;
$$;

-- Copy an exam (any status) into a fresh draft: the safe way to revise a
-- published exam without touching historical attempts.
create or replace function public.duplicate_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
  v_new uuid;
  v_qid uuid;
  v_key public.question_answer_keys;
  v_new_correct uuid;
  v_new_opt uuid;
  q record;
  o record;
begin
  insert into public.exams (
    course_id, subject_id, title, description, instructions, exam_type, total_marks, pass_marks,
    duration_minutes, starts_at, ends_at, max_attempts, shuffle_questions, shuffle_options,
    results_release, reveal_answers, allow_resubmission, status)
  values (
    v_exam.course_id, v_exam.subject_id, left('Copy of ' || v_exam.title, 200), v_exam.description,
    v_exam.instructions, v_exam.exam_type, v_exam.total_marks, v_exam.pass_marks, v_exam.duration_minutes,
    greatest(v_exam.starts_at, now() + interval '1 day'),
    greatest(v_exam.starts_at, now() + interval '1 day') + (v_exam.ends_at - v_exam.starts_at),
    v_exam.max_attempts, v_exam.shuffle_questions, v_exam.shuffle_options, v_exam.results_release,
    v_exam.reveal_answers, v_exam.allow_resubmission, 'draft')
  returning id into v_new;

  insert into public.exam_chapters (exam_id, chapter_id)
  select v_new, chapter_id from public.exam_chapters where exam_id = p_exam_id;

  for q in select * from public.questions where exam_id = p_exam_id order by position loop
    insert into public.questions (exam_id, type, position, body, image_path, marks, negative_marks, source_id)
    values (v_new, q.type, q.position, q.body, q.image_path, q.marks, q.negative_marks, q.source_id)
    returning id into v_qid;
    v_new_correct := null;
    select k.* into v_key from public.question_answer_keys k where k.question_id = q.id;
    for o in select * from public.question_options where question_id = q.id order by position loop
      insert into public.question_options (question_id, body, image_path, position)
      values (v_qid, o.body, o.image_path, o.position) returning id into v_new_opt;
      if o.id = v_key.correct_option_id then
        v_new_correct := v_new_opt;
      end if;
    end loop;
    insert into public.question_parts (question_id, label, body, marks, position)
    select v_qid, label, body, marks, position from public.question_parts where question_id = q.id;
    if v_key.question_id is not null then
      insert into public.question_answer_keys (question_id, correct_option_id, explanation, model_answer, rubric)
      values (v_qid, v_new_correct, v_key.explanation, v_key.model_answer, v_key.rubric);
    end if;
  end loop;

  perform app_private.write_audit('exam.duplicated', 'exam', v_new, jsonb_build_object('source_exam_id', p_exam_id));
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grading internals
-- ---------------------------------------------------------------------------
-- Idempotent: recomputes auto grades deterministically and upserts them.
create or replace function app_private.grade_mcq(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.grades (attempt_id, question_id, part_id, marks_awarded, max_marks, is_auto, status, graded_at)
  select
    a.id,
    q.id,
    null,
    case
      when sa.selected_option_id is null then 0
      when sa.selected_option_id = k.correct_option_id then q.marks
      else -q.negative_marks
    end,
    q.marks,
    true,
    'final',
    now()
  from public.exam_attempts a
  join public.questions q on q.exam_id = a.exam_id and q.type = 'mcq'
  left join public.question_answer_keys k on k.question_id = q.id
  left join public.student_answers sa on sa.attempt_id = a.id and sa.question_id = q.id
  where a.id = p_attempt_id
  on conflict on constraint grades_unique_item do update
    set marks_awarded = excluded.marks_awarded,
        max_marks = excluded.max_marks,
        graded_at = excluded.graded_at
    where public.grades.is_auto;
end;
$$;

-- Recompute the result summary from the stored grades.
create or replace function app_private.recompute_result(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams;
  v_mcq numeric;
  v_cq numeric;
  v_total numeric;
  v_required integer;
  v_final integer;
  v_any integer;
  v_status public.grading_status;
begin
  select e.* into v_exam from public.exams e join public.exam_attempts a on a.exam_id = e.id where a.id = p_attempt_id;

  select coalesce(sum(g.marks_awarded) filter (where g.is_auto), 0),
         coalesce(sum(g.marks_awarded) filter (where not g.is_auto and g.status = 'final'), 0)
  into v_mcq, v_cq
  from public.grades g where g.attempt_id = p_attempt_id;

  -- Gradable CQ items: each part, or the whole question when it has no parts.
  select count(*) into v_required from (
    select p.id from public.questions q join public.question_parts p on p.question_id = q.id
    where q.exam_id = v_exam.id and q.type = 'cq'
    union all
    select q.id from public.questions q
    where q.exam_id = v_exam.id and q.type = 'cq'
      and not exists (select 1 from public.question_parts p where p.question_id = q.id)
  ) items;

  select count(*) filter (where status = 'final'), count(*)
  into v_final, v_any
  from public.grades where attempt_id = p_attempt_id and not is_auto;

  v_status := case
    when v_required = 0 or v_final >= v_required then 'graded'
    when v_any > 0 then 'in_review'
    else 'pending'
  end;

  -- Negative marking can never push a total below zero.
  v_total := greatest(v_mcq + v_cq, 0);

  insert into public.attempt_results as r (
    attempt_id, mcq_score, cq_score, total_score, max_score, percentage, passed, grading_status, graded_at)
  values (
    p_attempt_id, v_mcq, v_cq, v_total, v_exam.total_marks,
    round(v_total / v_exam.total_marks * 100, 2),
    case when v_exam.pass_marks is null then null else v_total >= v_exam.pass_marks end,
    v_status,
    case when v_status = 'graded' then now() else null end)
  on conflict (attempt_id) do update set
    mcq_score = excluded.mcq_score,
    cq_score = excluded.cq_score,
    total_score = excluded.total_score,
    max_score = excluded.max_score,
    percentage = excluded.percentage,
    passed = excluded.passed,
    grading_status = excluded.grading_status,
    graded_at = case when excluded.grading_status = 'graded' then coalesce(r.graded_at, now()) else null end;
end;
$$;

-- Finalize one attempt. Caller must hold the row lock.
create or replace function app_private.finalize_attempt(p_attempt_id uuid, p_via public.submission_method)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exam_attempts
  set status = 'submitted', submitted_at = now(), submitted_via = p_via
  where id = p_attempt_id and status = 'in_progress';
  if found then
    perform app_private.grade_mcq(p_attempt_id);
    perform app_private.recompute_result(p_attempt_id);
  end if;
end;
$$;

-- Finalize every attempt whose server deadline has passed. Safe to run concurrently.
create or replace function app_private.finalize_expired_attempts_job()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id from public.exam_attempts
    where status = 'in_progress' and deadline_at + app_private.save_grace() < now()
    order by deadline_at
    for update skip locked
  loop
    perform app_private.finalize_attempt(r.id, 'timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.finalize_expired_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_teacher();
  return app_private.finalize_expired_attempts_job();
end;
$$;

-- ---------------------------------------------------------------------------
-- Student exam flow
-- ---------------------------------------------------------------------------
create or replace function public.get_exam_overview(p_exam_id uuid)
returns table (question_count integer, mcq_count integer, cq_count integer, attempts_used integer,
               open_attempt_id uuid, server_now timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  if not (app_private.student_can_view_exam(p_exam_id) or app_private.owns_exam(p_exam_id)) then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
  select
    (select count(*)::integer from public.questions where exam_id = p_exam_id),
    (select count(*)::integer from public.questions where exam_id = p_exam_id and type = 'mcq'),
    (select count(*)::integer from public.questions where exam_id = p_exam_id and type = 'cq'),
    (select count(*)::integer from public.exam_attempts where exam_id = p_exam_id and student_id = v_uid),
    (select id from public.exam_attempts where exam_id = p_exam_id and student_id = v_uid
       and status = 'in_progress' and deadline_at + app_private.save_grace() >= now() limit 1),
    now();
end;
$$;

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
  v_used integer;
  v_order uuid[];
  v_opt_order jsonb;
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
    else
      return v_open.id; -- resume the open attempt
    end if;
  end loop;

  if v_exam.status <> 'published' then
    raise exception 'EXAM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if now() < v_exam.starts_at then
    raise exception 'EXAM_NOT_STARTED' using errcode = 'P0001';
  end if;
  if now() >= v_exam.ends_at then
    raise exception 'EXAM_ENDED' using errcode = 'P0001';
  end if;

  select count(*) into v_used from public.exam_attempts where exam_id = p_exam_id and student_id = v_uid;
  if v_used >= v_exam.max_attempts then
    raise exception 'ATTEMPT_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  select array_agg(id order by case when v_exam.shuffle_questions then random() else position end, id)
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

  insert into public.exam_attempts (exam_id, student_id, attempt_number, deadline_at, question_order, option_order)
  values (
    p_exam_id, v_uid, v_used + 1,
    least(now() + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at),
    v_order, v_opt_order)
  returning id into v_id;

  perform app_private.write_audit('attempt.started', 'exam_attempt', v_id, jsonb_build_object('exam_id', p_exam_id));
  return v_id;
end;
$$;

-- Autosave one answer. Never raises for deadline problems: it returns a status
-- so that the timeout finalization it performs is committed.
--   status: 'saved' | 'stale' (a newer revision is stored) | 'deadline_passed' | 'finalized'
create or replace function public.save_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid,
  p_text_answer text,
  p_marked_for_review boolean,
  p_revision integer
)
returns table (status text, saved_at timestamptz, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_attempt public.exam_attempts;
  v_q public.questions;
  v_row public.student_answers;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'in_progress' then
    return query select 'finalized'::text, null::timestamptz, null::integer;
    return;
  end if;
  if now() > v_attempt.deadline_at + app_private.save_grace() then
    perform app_private.finalize_attempt(v_attempt.id, 'timeout');
    return query select 'deadline_passed'::text, null::timestamptz, null::integer;
    return;
  end if;

  select q.* into v_q from public.questions q where q.id = p_question_id and q.exam_id = v_attempt.exam_id;
  if v_q.id is null then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_selected_option_id is not null and (
       v_q.type <> 'mcq'
       or not exists (select 1 from public.question_options o where o.id = p_selected_option_id and o.question_id = v_q.id)) then
    raise exception 'INVALID_OPTION' using errcode = '22023';
  end if;
  if p_text_answer is not null and (v_q.type <> 'cq' or char_length(p_text_answer) > 20000) then
    raise exception 'INVALID_ANSWER' using errcode = '22023';
  end if;
  if p_revision is null or p_revision < 1 then
    raise exception 'INVALID_REVISION' using errcode = '22023';
  end if;

  insert into public.student_answers as sa
    (attempt_id, question_id, selected_option_id, text_answer, marked_for_review, revision, saved_at)
  values (p_attempt_id, p_question_id, p_selected_option_id, p_text_answer, coalesce(p_marked_for_review, false), p_revision, now())
  on conflict (attempt_id, question_id) do update set
    selected_option_id = excluded.selected_option_id,
    text_answer = excluded.text_answer,
    marked_for_review = excluded.marked_for_review,
    revision = excluded.revision,
    saved_at = excluded.saved_at
  where sa.revision < excluded.revision
  returning sa.* into v_row;

  if v_row.id is null then
    select sa.* into v_row from public.student_answers sa
    where sa.attempt_id = p_attempt_id and sa.question_id = p_question_id;
    return query select 'stale'::text, v_row.saved_at, v_row.revision;
  else
    return query select 'saved'::text, v_row.saved_at, v_row.revision;
  end if;
end;
$$;

-- Idempotent submission. Returns 'submitted' or 'already_submitted'.
create or replace function public.submit_attempt(p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_attempt public.exam_attempts;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'submitted' then
    return 'already_submitted';
  end if;
  if v_attempt.status = 'returned' then
    if v_attempt.resubmit_deadline_at is not null and now() > v_attempt.resubmit_deadline_at + app_private.save_grace() then
      raise exception 'DEADLINE_PASSED' using errcode = 'P0001';
    end if;
    update public.exam_attempts set status = 'submitted', submitted_at = now(), submitted_via = 'student'
    where id = p_attempt_id;
    perform app_private.recompute_result(p_attempt_id);
    perform app_private.write_audit('attempt.resubmitted', 'exam_attempt', p_attempt_id);
    return 'submitted';
  end if;

  perform app_private.finalize_attempt(
    p_attempt_id,
    case when now() > v_attempt.deadline_at + app_private.save_grace() then 'timeout' else 'student' end::public.submission_method);
  perform app_private.write_audit('attempt.submitted', 'exam_attempt', p_attempt_id);
  return 'submitted';
end;
$$;

-- Best-effort integrity log (tab switches). Rate limited.
create or replace function public.log_attempt_event(p_attempt_id uuid, p_event_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  if not exists (select 1 from public.exam_attempts
                 where id = p_attempt_id and student_id = v_uid and status = 'in_progress') then
    return;
  end if;
  if not app_private.check_rate_limit('attempt_event', 120, 600) then
    return;
  end if;
  insert into public.attempt_events (attempt_id, event_type) values (p_attempt_id, p_event_type);
end;
$$;

-- Can the caller upload CQ answer files for this attempt right now?
create or replace function app_private.can_upload_answer(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exam_attempts a
    where a.id = p_attempt_id
      and a.student_id = (select auth.uid())
      and (
        (a.status = 'in_progress' and now() <= a.deadline_at + app_private.save_grace())
        or (a.status = 'returned' and (a.resubmit_deadline_at is null or now() <= a.resubmit_deadline_at + app_private.save_grace()))
      )
  );
$$;
grant execute on function app_private.can_upload_answer(uuid), app_private.save_grace() to authenticated;

create or replace function public.register_answer_file(
  p_attempt_id uuid, p_question_id uuid, p_part_id uuid, p_storage_path text,
  p_file_name text, p_mime_type text, p_size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_attempt public.exam_attempts;
  v_id uuid;
  v_count integer;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not app_private.can_upload_answer(p_attempt_id) then
    raise exception 'UPLOAD_CLOSED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.questions where id = p_question_id and exam_id = v_attempt.exam_id and type = 'cq') then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_part_id is not null and not exists (select 1 from public.question_parts where id = p_part_id and question_id = p_question_id) then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_storage_path not like v_uid::text || '/' || p_attempt_id::text || '/%' then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '42501';
  end if;
  select count(*) into v_count from public.answer_files where attempt_id = p_attempt_id;
  if v_count >= 60 then
    raise exception 'TOO_MANY_FILES' using errcode = 'P0001';
  end if;

  insert into public.answer_files (attempt_id, question_id, part_id, storage_path, file_name, mime_type, size_bytes, page_order)
  values (p_attempt_id, p_question_id, p_part_id, p_storage_path, left(p_file_name, 255), p_mime_type, p_size_bytes,
    (select coalesce(max(page_order), -1) + 1 from public.answer_files
     where attempt_id = p_attempt_id and question_id = p_question_id))
  returning id into v_id;
  return v_id;
end;
$$;

-- Returns the storage path so the client can remove the object as well.
create or replace function public.delete_answer_file(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.answer_files;
begin
  select f.* into v_file from public.answer_files f where f.id = p_file_id;
  if v_file.id is null or not app_private.owns_attempt(v_file.attempt_id) then
    raise exception 'FILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not app_private.can_upload_answer(v_file.attempt_id) then
    raise exception 'UPLOAD_CLOSED' using errcode = 'P0001';
  end if;
  delete from public.answer_files where id = p_file_id;
  return v_file.storage_path;
end;
$$;

-- Released answer keys for the caller's own attempt (empty until released).
create or replace function public.get_released_answer_keys(p_attempt_id uuid)
returns table (question_id uuid, correct_option_id uuid, explanation text, model_answer text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app_private.owns_attempt(p_attempt_id) and app_private.answers_revealed(p_attempt_id)) then
    return;
  end if;
  return query
  select k.question_id, k.correct_option_id, k.explanation, k.model_answer
  from public.question_answer_keys k
  join public.questions q on q.id = k.question_id
  join public.exam_attempts a on a.exam_id = q.exam_id
  where a.id = p_attempt_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher grading
-- ---------------------------------------------------------------------------
create or replace function public.save_cq_grade(
  p_attempt_id uuid, p_question_id uuid, p_part_id uuid, p_marks numeric, p_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_teacher();
  v_attempt public.exam_attempts;
  v_q public.questions;
  v_max numeric;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or not app_private.owns_exam(v_attempt.exam_id) then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;
  select q.* into v_q from public.questions q where q.id = p_question_id and q.exam_id = v_attempt.exam_id and q.type = 'cq';
  if v_q.id is null then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_part_id is null then
    if exists (select 1 from public.question_parts where question_id = p_question_id) then
      raise exception 'PART_REQUIRED' using errcode = '22023';
    end if;
    v_max := v_q.marks;
  else
    select marks into v_max from public.question_parts where id = p_part_id and question_id = p_question_id;
    if v_max is null then
      raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if p_marks is null or p_marks < 0 or p_marks > v_max then
    raise exception 'INVALID_MARKS' using errcode = '22023', detail = format('Marks must be between 0 and %s.', v_max);
  end if;

  insert into public.grades (attempt_id, question_id, part_id, marks_awarded, max_marks, is_auto, feedback, status, graded_by, graded_at)
  values (p_attempt_id, p_question_id, p_part_id, p_marks, v_max, false, nullif(trim(p_feedback), ''), 'draft', v_uid, now())
  on conflict on constraint grades_unique_item do update set
    marks_awarded = excluded.marks_awarded,
    max_marks = excluded.max_marks,
    feedback = excluded.feedback,
    status = 'draft',
    graded_by = excluded.graded_by,
    graded_at = excluded.graded_at;

  perform app_private.recompute_result(p_attempt_id);
  perform app_private.write_audit('grade.saved', 'exam_attempt', p_attempt_id,
    jsonb_build_object('question_id', p_question_id, 'part_id', p_part_id, 'marks', p_marks));
end;
$$;

-- Marks all CQ grades final. Fails unless every CQ item has a grade.
create or replace function public.finalize_grading(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_teacher();
  v_attempt public.exam_attempts;
  v_missing integer;
begin
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or not app_private.owns_exam(v_attempt.exam_id) then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;

  select count(*) into v_missing from (
    select q.id as qid, p.id as pid from public.questions q join public.question_parts p on p.question_id = q.id
    where q.exam_id = v_attempt.exam_id and q.type = 'cq'
    union all
    select q.id, null from public.questions q
    where q.exam_id = v_attempt.exam_id and q.type = 'cq'
      and not exists (select 1 from public.question_parts p where p.question_id = q.id)
  ) items
  where not exists (
    select 1 from public.grades g
    where g.attempt_id = p_attempt_id and g.question_id = items.qid and g.part_id is not distinct from items.pid
  );
  if v_missing > 0 then
    raise exception 'GRADING_INCOMPLETE' using errcode = 'P0001', detail = format('%s item(s) still need marks.', v_missing);
  end if;

  update public.grades set status = 'final', graded_by = v_uid where attempt_id = p_attempt_id and not is_auto;
  perform app_private.grade_mcq(p_attempt_id);
  perform app_private.recompute_result(p_attempt_id);
  update public.attempt_results set graded_by = v_uid where attempt_id = p_attempt_id;
  perform app_private.write_audit('grading.finalized', 'exam_attempt', p_attempt_id);
end;
$$;

create or replace function public.reopen_grading(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
begin
  perform app_private.require_teacher();
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or not app_private.owns_exam(v_attempt.exam_id) then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.grades set status = 'draft' where attempt_id = p_attempt_id and not is_auto;
  perform app_private.recompute_result(p_attempt_id);
  perform app_private.write_audit('grading.reopened', 'exam_attempt', p_attempt_id);
end;
$$;

-- Return CQ work to the student for correction (if the exam allows it).
create or replace function public.return_attempt(p_attempt_id uuid, p_note text, p_resubmit_deadline timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
begin
  perform app_private.require_teacher();
  select a.* into v_attempt from public.exam_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null or not app_private.owns_exam(v_attempt.exam_id) then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select e.* into v_exam from public.exams e where e.id = v_attempt.exam_id;
  if not v_exam.allow_resubmission or v_exam.exam_type = 'mcq' then
    raise exception 'RESUBMISSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;
  if p_resubmit_deadline is null or p_resubmit_deadline <= now() then
    raise exception 'INVALID_DEADLINE' using errcode = '22023';
  end if;
  update public.exam_attempts
  set status = 'returned', returned_at = now(), return_note = nullif(trim(p_note), ''),
      resubmit_deadline_at = p_resubmit_deadline
  where id = p_attempt_id;
  update public.grades set status = 'draft' where attempt_id = p_attempt_id and not is_auto;
  perform app_private.recompute_result(p_attempt_id);
  perform app_private.write_audit('attempt.returned', 'exam_attempt', p_attempt_id,
    jsonb_build_object('resubmit_deadline_at', p_resubmit_deadline));
end;
$$;

-- Administrative correction of an MCQ answer key on a published exam.
-- Explicit, audited, and regrades every submitted attempt consistently.
create or replace function public.correct_answer_key(p_question_id uuid, p_correct_option_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.questions;
  v_old uuid;
  r record;
  v_count integer := 0;
begin
  select q.* into v_q from public.questions q where q.id = p_question_id and q.type = 'mcq';
  if v_q.id is null then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app_private.require_exam_owner(v_q.exam_id);
  if not exists (select 1 from public.question_options where id = p_correct_option_id and question_id = p_question_id) then
    raise exception 'INVALID_OPTION' using errcode = '22023';
  end if;

  perform 1 from public.exams where id = v_q.exam_id for update;
  select correct_option_id into v_old from public.question_answer_keys where question_id = p_question_id;

  perform set_config('app.allow_locked_edit', 'on', true);
  insert into public.question_answer_keys (question_id, correct_option_id)
  values (p_question_id, p_correct_option_id)
  on conflict (question_id) do update set correct_option_id = excluded.correct_option_id;
  perform set_config('app.allow_locked_edit', 'off', true);

  for r in select id from public.exam_attempts where exam_id = v_q.exam_id and status <> 'in_progress' for update loop
    perform app_private.grade_mcq(r.id);
    perform app_private.recompute_result(r.id);
    v_count := v_count + 1;
  end loop;

  perform app_private.write_audit('answer_key.corrected', 'question', p_question_id,
    jsonb_build_object('from', v_old, 'to', p_correct_option_id, 'regraded_attempts', v_count));
  return v_count;
end;
$$;

-- Close an exam early: no new attempts, open attempts are finalized now.
create or replace function public.close_exam(p_exam_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
  r record;
  v_count integer := 0;
begin
  if v_exam.status <> 'published' then
    raise exception 'EXAM_NOT_PUBLISHED' using errcode = 'P0001';
  end if;
  update public.exams set status = 'closed', closed_at = now(), ends_at = least(ends_at, now())
  where id = p_exam_id;
  for r in select id from public.exam_attempts where exam_id = p_exam_id and status = 'in_progress' for update loop
    perform app_private.finalize_attempt(r.id, 'teacher');
    v_count := v_count + 1;
  end loop;
  perform app_private.write_audit('exam.closed', 'exam', p_exam_id, jsonb_build_object('finalized_attempts', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for RPCs
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon;
grant execute on function
  public.redeem_course_invite(text),
  public.enroll_student_by_email(uuid, text),
  public.validate_exam_for_publish(uuid),
  public.publish_exam(uuid),
  public.unpublish_exam(uuid),
  public.archive_exam(uuid),
  public.restore_exam(uuid),
  public.publish_results(uuid),
  public.unpublish_results(uuid),
  public.reorder_questions(uuid, uuid[]),
  public.duplicate_question(uuid),
  public.duplicate_exam(uuid),
  public.finalize_expired_attempts(),
  public.get_exam_overview(uuid),
  public.start_attempt(uuid),
  public.save_answer(uuid, uuid, uuid, text, boolean, integer),
  public.submit_attempt(uuid),
  public.log_attempt_event(uuid, text),
  public.register_answer_file(uuid, uuid, uuid, text, text, text, integer),
  public.delete_answer_file(uuid),
  public.get_released_answer_keys(uuid),
  public.save_cq_grade(uuid, uuid, uuid, numeric, text),
  public.finalize_grading(uuid),
  public.reopen_grading(uuid),
  public.return_attempt(uuid, text, timestamptz),
  public.correct_answer_key(uuid, uuid),
  public.close_exam(uuid)
to authenticated;
