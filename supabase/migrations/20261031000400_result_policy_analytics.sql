-- =============================================================================
-- Which attempt counts, and analytics that scale.
--
--  * exams.result_policy: when a student has several attempts, the teacher
--    chooses whether the BEST (default) or the LATEST attempt is their result.
--  * public.counted_attempts: one row per (exam, student) — the attempt that
--    counts. security_invoker, so RLS on exam_attempts / attempt_results
--    applies (students see only their own, the teacher only their exams).
--  * public.results_overview(): the teacher's results page statistics,
--    computed in the database over counted attempts only (no row cap).
-- =============================================================================

create type public.result_policy as enum ('best', 'latest');

alter table public.exams add column result_policy public.result_policy not null default 'best';
comment on column public.exams.result_policy is
  'With several attempts per student: best = highest graded score counts; latest = the most recent submission counts.';
grant update (result_policy) on public.exams to authenticated;

create index if not exists exam_attempts_exam_student_idx on public.exam_attempts (exam_id, student_id, attempt_number desc);

-- Best: graded attempts first, highest score, then the most recent. Latest: the most recent submission,
-- even while it is still being graded (its result then shows as pending).
create view public.counted_attempts with (security_invoker = true) as
select distinct on (a.exam_id, a.student_id)
  a.id as attempt_id, a.exam_id, a.student_id, a.attempt_number, a.submitted_at
from public.exam_attempts a
join public.exams e on e.id = a.exam_id
left join public.attempt_results r on r.attempt_id = a.id
where a.status <> 'in_progress'
order by
  a.exam_id, a.student_id,
  case when e.result_policy = 'best' and r.grading_status = 'graded' then 0 when e.result_policy = 'best' then 1 else 0 end,
  case when e.result_policy = 'best' then r.total_score end desc nulls last,
  a.attempt_number desc;

grant select on public.counted_attempts to authenticated;

-- Results page statistics for the signed-in teacher. Bounds are instants (the app converts the
-- teacher's calendar days to UTC). Averages and pass rates use counted, fully graded attempts.
create or replace function public.results_overview(
  p_course_id uuid default null,
  p_exam_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_teacher();
  v_result jsonb;
begin
  with mine as (
    select e.id, e.title, e.starts_at, c.title as course_title
    from public.exams e join public.courses c on c.id = e.course_id
    where c.teacher_id = v_uid
      and (p_course_id is null or e.course_id = p_course_id)
      and (p_exam_id is null or e.id = p_exam_id)
  ),
  submitted as (
    select a.id, a.exam_id, a.student_id, a.submitted_at
    from public.exam_attempts a join mine m on m.id = a.exam_id
    where a.status <> 'in_progress'
      and (p_from is null or a.submitted_at >= p_from)
      and (p_to is null or a.submitted_at < p_to)
  ),
  counted as (
    select distinct on (s.exam_id, s.student_id)
      s.id, s.exam_id, s.student_id, s.submitted_at,
      r.percentage, r.passed, coalesce(r.grading_status = 'graded', false) as graded
    from submitted s
    join public.exams e on e.id = s.exam_id
    join public.exam_attempts a on a.id = s.id
    left join public.attempt_results r on r.attempt_id = s.id
    order by
      s.exam_id, s.student_id,
      case when e.result_policy = 'best' and r.grading_status = 'graded' then 0 when e.result_policy = 'best' then 1 else 0 end,
      case when e.result_policy = 'best' then r.total_score end desc nulls last,
      a.attempt_number desc
  ),
  per_exam as (
    select m.id, m.title, m.course_title, m.starts_at,
      count(*) filter (where c.graded) as graded,
      count(*) filter (where not c.graded) as pending,
      round(avg(c.percentage) filter (where c.graded), 1) as average,
      max(c.percentage) filter (where c.graded) as highest,
      min(c.percentage) filter (where c.graded) as lowest,
      round(100.0 * count(*) filter (where c.graded and c.passed) / nullif(count(*) filter (where c.graded and c.passed is not null), 0), 1) as pass_rate
    from counted c join mine m on m.id = c.exam_id
    group by m.id, m.title, m.course_title, m.starts_at
  ),
  per_student as (
    select c.student_id, p.full_name,
      count(*) as attempts,
      round(avg(c.percentage), 1) as average,
      (array_agg(c.percentage order by c.submitted_at))[greatest(count(*) - 4, 1):] as recent
    from counted c join public.profiles p on p.id = c.student_id
    where c.graded
    group by c.student_id, p.full_name
  )
  select jsonb_build_object(
    'submitted', (select count(*) from submitted),
    'counted', (select count(*) from counted),
    'pending', (select count(*) from counted where not graded),
    'average', (select round(avg(percentage), 1) from counted where graded),
    'passRate', (select round(100.0 * count(*) filter (where passed) / nullif(count(*) filter (where passed is not null), 0), 1) from counted where graded),
    'exams', coalesce((select jsonb_agg(jsonb_build_object(
        'examId', id, 'examTitle', title, 'courseTitle', course_title, 'graded', graded, 'pending', pending,
        'average', average, 'highest', highest, 'lowest', lowest, 'passRate', pass_rate) order by starts_at desc) from per_exam), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'studentId', student_id, 'studentName', coalesce(nullif(full_name, ''), 'Unnamed student'),
        'attempts', attempts, 'average', average, 'recent', to_jsonb(recent),
        'change', case when cardinality(recent) >= 2 then round(recent[cardinality(recent)] - recent[1], 1) end)
        order by average desc) from per_student), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.results_overview(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.results_overview(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- duplicate_exam keeps the policy.
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
    results_release, result_policy, reveal_answers, allow_resubmission, status)
  values (
    v_exam.course_id, v_exam.subject_id, left('Copy of ' || v_exam.title, 200), v_exam.description,
    v_exam.instructions, v_exam.exam_type, v_exam.total_marks, v_exam.pass_marks, v_exam.duration_minutes,
    v_exam.mcq_duration_minutes,
    v_start,
    date_trunc('minute', v_start + (v_exam.ends_at - v_exam.starts_at)),
    v_exam.max_attempts, v_exam.shuffle_questions, v_exam.shuffle_options, v_exam.results_release,
    v_exam.result_policy, v_exam.reveal_answers, v_exam.allow_resubmission, 'draft')
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
