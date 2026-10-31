-- =============================================================================
-- Exam / result correctness fixes (found by an audit; each has a DB test).
--
--  1. Returned attempts whose resubmit deadline passed were stuck in
--     'returned' forever (no grading, no result). The scheduled/lazy job now
--     hands them back to the teacher as 'submitted'.
--  2. Per-question MCQ marks (grades.is_auto) revealed which answers were
--     right while the exam was still open (immediate release, multiple
--     attempts, classmates still writing). They now follow the same rule as
--     answer keys. Totals in attempt_results are unaffected.
--  3. Changing the pass mark after grading left `passed` stale.
--  4. Changing ends_at did not move the deadline of attempts in progress
--     (extending didn't help capped attempts; shortening didn't stop them).
--  5. A window that had already ended could be reopened after results /
--     answer keys were released.
--  6. "Hide results" had no effect for immediate / after-close release.
--  7. Duplicated exams kept sub-minute start times, so the edit form (which
--     works in minutes) tripped EXAM_SETTINGS_LOCKED once the exam started.
--  8. MCQs could still be changed for the 5 s grace after handing the MCQ
--     section in early (new exam_attempts.mcq_handed_in_at).
--  9. reopen_grading accepted attempts that were not submitted.
-- 10. Answer keys could be released while an attempt was still inside its
--     5 s save grace.
-- =============================================================================

-- 1. ---------------------------------------------------------------------------
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

  -- Corrections not resubmitted in time go back to the teacher with what was uploaded.
  for r in
    select id from public.exam_attempts
    where status = 'returned' and resubmit_deadline_at is not null
      and resubmit_deadline_at + app_private.save_grace() < now()
    for update skip locked
  loop
    update public.exam_attempts set status = 'submitted' where id = r.id;
    perform app_private.recompute_result(r.id);
    perform app_private.write_audit('attempt.resubmit_expired', 'exam_attempt', r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 2 + 10. -----------------------------------------------------------------------
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
    );
$$;

drop policy if exists grades_student_select on public.grades;
create policy grades_student_select on public.grades for select to authenticated
  using (
    status = 'final'
    and app_private.owns_attempt(attempt_id)
    and app_private.results_visible(attempt_id)
    -- An MCQ's mark tells whether the answer was right: same rule as the answer key.
    and (not is_auto or app_private.answers_revealed(attempt_id))
  );

-- 5 + 7. ------------------------------------------------------------------------
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
       -- The form edits times in whole minutes.
       or (date_trunc('minute', new.starts_at) is distinct from date_trunc('minute', old.starts_at) and old.starts_at <= now()) then
      raise exception 'EXAM_SETTINGS_LOCKED' using errcode = 'P0001';
    end if;
    -- Results and answer keys may already be out: an ended window can't be reopened.
    if old.ends_at <= now() and new.ends_at > now() then
      raise exception 'EXAM_WINDOW_ENDED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 3 + 4. ------------------------------------------------------------------------
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
      select * from public.exam_attempts where exam_id = new.id and status = 'in_progress' for update
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

drop trigger if exists exams_sync_changes on public.exams;
create trigger exams_sync_changes after update of ends_at, pass_marks on public.exams
  for each row execute function app_private.sync_exam_changes();

-- 6. ---------------------------------------------------------------------------
-- Hiding results switches the exam to manual release, so it works for every mode.
create or replace function public.unpublish_results(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_exam_owner(p_exam_id);
  update public.exams set results_published_at = null, results_release = 'manual' where id = p_exam_id;
  perform app_private.write_audit('results.unpublished', 'exam', p_exam_id);
end;
$$;

-- 7. ---------------------------------------------------------------------------
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
  v_start timestamptz := date_trunc('minute', greatest(v_exam.starts_at, now() + interval '1 day'));
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
    v_start,
    date_trunc('minute', v_start + (v_exam.ends_at - v_exam.starts_at)),
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

-- 8. ---------------------------------------------------------------------------
-- Handing the MCQ section in closes it at once: the 5 s network grace only
-- applies when the section timer runs out, not after an explicit hand-in.
alter table public.exam_attempts add column mcq_handed_in_at timestamptz;

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
  if v_attempt.status = 'in_progress' and v_attempt.mcq_handed_in_at is null and now() < v_attempt.mcq_deadline_at then
    update public.exam_attempts set mcq_deadline_at = now(), mcq_handed_in_at = now() where id = p_attempt_id
    returning mcq_deadline_at into v_attempt.mcq_deadline_at;
    perform app_private.write_audit('attempt.mcq_section_ended', 'exam_attempt', p_attempt_id);
  end if;
  return v_attempt.mcq_deadline_at;
end;
$$;

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
     and (v_attempt.mcq_handed_in_at is not null or now() > v_attempt.mcq_deadline_at + app_private.save_grace()) then
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

-- 9. ---------------------------------------------------------------------------
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
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;
  update public.grades set status = 'draft' where attempt_id = p_attempt_id and not is_auto;
  perform app_private.recompute_result(p_attempt_id);
  perform app_private.write_audit('grading.reopened', 'exam_attempt', p_attempt_id);
end;
$$;
