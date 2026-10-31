-- =============================================================================
-- Timed MCQ section for mixed exams (board-exam style).
--
-- A mixed exam may give MCQs their own time limit inside the overall duration:
--   * the attempt starts in the MCQ section; only MCQs are answerable,
--   * when the MCQ time is up (or the student hands the section in early) the
--     MCQ answers are locked on the server,
--   * the rest of the overall duration is for the written (CQ) part.
--
-- The server is authoritative: save_answer() refuses MCQ changes after
-- exam_attempts.mcq_deadline_at (+ the usual network grace).
-- =============================================================================

alter table public.exams
  add column mcq_duration_minutes integer,
  add constraint exams_mcq_duration_check check (
    mcq_duration_minutes is null
    or (exam_type = 'mixed' and mcq_duration_minutes >= 1 and mcq_duration_minutes < duration_minutes)
  );

comment on column public.exams.mcq_duration_minutes is
  'Mixed exams only: minutes for the MCQ section, which comes first and locks when it ends. Null = one shared timer.';

alter table public.exam_attempts
  add column mcq_deadline_at timestamptz,
  add constraint exam_attempts_mcq_deadline_check check (
    mcq_deadline_at is null or (mcq_deadline_at >= started_at and mcq_deadline_at <= deadline_at)
  );

comment on column public.exam_attempts.mcq_deadline_at is
  'When MCQ answers lock for this attempt (section time up or handed in early). Null = no separate MCQ section.';

grant update (mcq_duration_minutes) on public.exams to authenticated;

-- ---------------------------------------------------------------------------
-- Freeze the MCQ section time once an exam is published / attempted.
-- ---------------------------------------------------------------------------
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
       or new.mcq_duration_minutes is distinct from old.mcq_duration_minutes
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

-- ---------------------------------------------------------------------------
-- Publication checks: a timed MCQ section needs both MCQs and written questions.
-- Also fixes the plain-literal problems ('The exam has no questions.' etc.):
-- `text[] || 'literal'` parses the literal as an array and raised
-- "malformed array literal" instead of returning the problem list.
-- ---------------------------------------------------------------------------
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
    v_problems := v_problems || 'The exam has no questions.'::text;
  end if;
  if v_sum <> v_exam.total_marks then
    v_problems := v_problems || format('Question marks add up to %s but the exam total is %s.', v_sum, v_exam.total_marks);
  end if;
  if v_exam.exam_type = 'mcq' and exists (select 1 from public.questions where exam_id = p_exam_id and type = 'cq') then
    v_problems := v_problems || 'An MCQ exam cannot contain written (CQ) questions.'::text;
  end if;
  if v_exam.exam_type = 'cq' and exists (select 1 from public.questions where exam_id = p_exam_id and type = 'mcq') then
    v_problems := v_problems || 'A CQ exam cannot contain MCQ questions.'::text;
  end if;
  if v_exam.mcq_duration_minutes is not null then
    if not exists (select 1 from public.questions where exam_id = p_exam_id and type = 'mcq') then
      v_problems := v_problems || 'An MCQ section time is set, but the exam has no MCQ questions.'::text;
    end if;
    if not exists (select 1 from public.questions where exam_id = p_exam_id and type = 'cq') then
      v_problems := v_problems || 'An MCQ section time is set, but the exam has no written (CQ) questions. Use an MCQ-only exam instead.'::text;
    end if;
  end if;
  if v_exam.ends_at <= now() then
    v_problems := v_problems || 'The exam end time is in the past.'::text;
  end if;
  if v_exam.ends_at - v_exam.starts_at < make_interval(mins => 1) then
    v_problems := v_problems || 'The exam window is too short.'::text;
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

-- ---------------------------------------------------------------------------
-- Duplicate keeps the MCQ section time.
-- ---------------------------------------------------------------------------
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
    duration_minutes, mcq_duration_minutes, starts_at, ends_at, max_attempts, shuffle_questions, shuffle_options,
    results_release, reveal_answers, allow_resubmission, status)
  values (
    v_exam.course_id, v_exam.subject_id, left('Copy of ' || v_exam.title, 200), v_exam.description,
    v_exam.instructions, v_exam.exam_type, v_exam.total_marks, v_exam.pass_marks, v_exam.duration_minutes,
    v_exam.mcq_duration_minutes,
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
-- Start: with an MCQ section, MCQs come first and get their own deadline.
-- ---------------------------------------------------------------------------
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
  v_deadline timestamptz;
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

  v_deadline := least(now() + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at);

  insert into public.exam_attempts (exam_id, student_id, attempt_number, deadline_at, mcq_deadline_at, question_order, option_order)
  values (
    p_exam_id, v_uid, v_used + 1,
    v_deadline,
    case when v_exam.mcq_duration_minutes is null then null
         else least(now() + make_interval(mins => v_exam.mcq_duration_minutes), v_deadline) end,
    v_order, v_opt_order)
  returning id into v_id;

  perform app_private.write_audit('attempt.started', 'exam_attempt', v_id, jsonb_build_object('exam_id', p_exam_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Autosave. New status 'section_closed': an MCQ change arrived after the MCQ
-- section ended and was not stored. The attempt itself stays open.
-- ---------------------------------------------------------------------------
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
  if v_q.type = 'mcq' and v_attempt.mcq_deadline_at is not null
     and now() > v_attempt.mcq_deadline_at + app_private.save_grace() then
    select sa.* into v_row from public.student_answers sa
    where sa.attempt_id = p_attempt_id and sa.question_id = p_question_id;
    return query select 'section_closed'::text, v_row.saved_at, v_row.revision;
    return;
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

-- ---------------------------------------------------------------------------
-- Hand in the MCQ section early. Idempotent; returns the (new) MCQ deadline.
-- ---------------------------------------------------------------------------
create or replace function public.end_mcq_section(p_attempt_id uuid)
returns timestamptz
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
  if v_attempt.mcq_deadline_at is null then
    raise exception 'NO_MCQ_SECTION' using errcode = 'P0001';
  end if;
  if v_attempt.status = 'in_progress' and now() < v_attempt.mcq_deadline_at then
    update public.exam_attempts set mcq_deadline_at = now() where id = p_attempt_id
    returning mcq_deadline_at into v_attempt.mcq_deadline_at;
    perform app_private.write_audit('attempt.mcq_section_ended', 'exam_attempt', p_attempt_id);
  end if;
  return v_attempt.mcq_deadline_at;
end;
$$;

revoke all on function public.end_mcq_section(uuid) from public, anon;
grant execute on function public.end_mcq_section(uuid) to authenticated;
