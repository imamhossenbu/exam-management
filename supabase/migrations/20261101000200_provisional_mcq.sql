-- =============================================================================
-- Provisional MCQ score for mixed exams.
--
-- In a mixed exam the result is released only once the written part is
-- graded. With show_mcq_early the student sees their MCQ total right after
-- submitting ("MCQ 18/20 · written part being graded"). Only the total:
-- per-question marks and correct answers keep following the answer-key rule.
-- =============================================================================

alter table public.exams
  add column show_mcq_early boolean not null default false,
  add constraint exams_show_mcq_early_check check (not show_mcq_early or exam_type = 'mixed');

comment on column public.exams.show_mcq_early is 'Mixed exams: show students their MCQ total right after submission, before the written part is graded.';
grant update (show_mcq_early) on public.exams to authenticated;

create or replace function public.get_provisional_mcq(p_attempt_id uuid)
returns table (mcq_score numeric, mcq_max numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.mcq_score,
    (select coalesce(sum(q.marks), 0) from public.questions q where q.exam_id = e.id and q.type = 'mcq')
  from public.exam_attempts a
  join public.exams e on e.id = a.exam_id
  join public.attempt_results r on r.attempt_id = a.id
  where a.id = p_attempt_id
    and a.student_id = (select auth.uid())
    and a.status in ('submitted', 'returned')
    and e.exam_type = 'mixed'
    and e.show_mcq_early;
$$;

revoke all on function public.get_provisional_mcq(uuid) from public, anon;
grant execute on function public.get_provisional_mcq(uuid) to authenticated;

-- duplicate_exam keeps the setting.
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
    results_release, result_policy, reveal_answers, allow_resubmission, show_mcq_early, status)
  values (
    v_exam.course_id, v_exam.subject_id, left('Copy of ' || v_exam.title, 200), v_exam.description,
    v_exam.instructions, v_exam.exam_type, v_exam.total_marks, v_exam.pass_marks, v_exam.duration_minutes,
    v_exam.mcq_duration_minutes,
    v_start,
    date_trunc('minute', v_start + (v_exam.ends_at - v_exam.starts_at)),
    v_exam.max_attempts, v_exam.shuffle_questions, v_exam.shuffle_options, v_exam.results_release,
    v_exam.result_policy, v_exam.reveal_answers, v_exam.allow_resubmission, v_exam.show_mcq_early, 'draft')
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
