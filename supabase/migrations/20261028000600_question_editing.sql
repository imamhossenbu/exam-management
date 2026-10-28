-- =============================================================================
-- Transactional question editing. These run as SECURITY INVOKER: the caller's
-- RLS policies and the exam-lock triggers apply exactly as for direct writes,
-- but every multi-table change succeeds or fails as a unit.
--
-- p_data shape:
-- {
--   "type": "mcq" | "cq", "body": text, "image_path": text|null,
--   "marks": number, "negative_marks": number,
--   "options": [{ "body": text, "image_path": text|null, "is_correct": bool }],
--   "parts":   [{ "label": text, "body": text, "marks": number }],
--   "explanation": text|null, "model_answer": text|null, "rubric": text|null,
--   "source_id": uuid|null
-- }
-- =============================================================================

create or replace function public.save_question(p_exam_id uuid, p_question_id uuid, p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_question_id;
  v_type public.question_type := (p_data ->> 'type')::public.question_type;
  v_exam_type public.exam_type;
  v_correct uuid;
  v_opt jsonb;
  v_part jsonb;
  v_opt_id uuid;
  v_i integer := 0;
  v_correct_count integer := 0;
begin
  select exam_type into v_exam_type from public.exams where id = p_exam_id;
  if v_exam_type is null then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if (v_exam_type = 'mcq' and v_type <> 'mcq') or (v_exam_type = 'cq' and v_type <> 'cq') then
    raise exception 'INVALID_ANSWER' using errcode = '22023', detail = 'Question type does not match the exam type.';
  end if;

  if v_id is null then
    insert into public.questions (exam_id, type, position, body, image_path, marks, negative_marks, source_id)
    values (
      p_exam_id, v_type,
      (select coalesce(max(position), -1) + 1 from public.questions where exam_id = p_exam_id),
      p_data ->> 'body', nullif(p_data ->> 'image_path', ''),
      (p_data ->> 'marks')::numeric,
      case when v_type = 'mcq' then coalesce((p_data ->> 'negative_marks')::numeric, 0) else 0 end,
      nullif(p_data ->> 'source_id', '')::uuid)
    returning id into v_id;
  else
    update public.questions set
      type = v_type,
      body = p_data ->> 'body',
      image_path = nullif(p_data ->> 'image_path', ''),
      marks = (p_data ->> 'marks')::numeric,
      negative_marks = case when v_type = 'mcq' then coalesce((p_data ->> 'negative_marks')::numeric, 0) else 0 end
    where id = v_id and exam_id = p_exam_id;
    if not found then
      raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0002';
    end if;
    delete from public.question_answer_keys where question_id = v_id;
    delete from public.question_options where question_id = v_id;
    delete from public.question_parts where question_id = v_id;
  end if;

  if v_type = 'mcq' then
    for v_opt in select * from jsonb_array_elements(coalesce(p_data -> 'options', '[]'::jsonb)) loop
      insert into public.question_options (question_id, body, image_path, position)
      values (v_id, v_opt ->> 'body', nullif(v_opt ->> 'image_path', ''), v_i)
      returning id into v_opt_id;
      if coalesce((v_opt ->> 'is_correct')::boolean, false) then
        v_correct := v_opt_id;
        v_correct_count := v_correct_count + 1;
      end if;
      v_i := v_i + 1;
    end loop;
    if v_correct_count > 1 then
      raise exception 'INVALID_OPTION' using errcode = '22023', detail = 'Select exactly one correct option.';
    end if;
  else
    for v_part in select * from jsonb_array_elements(coalesce(p_data -> 'parts', '[]'::jsonb)) loop
      insert into public.question_parts (question_id, label, body, marks, position)
      values (v_id, v_part ->> 'label', v_part ->> 'body', (v_part ->> 'marks')::numeric, v_i);
      v_i := v_i + 1;
    end loop;
  end if;

  insert into public.question_answer_keys (question_id, correct_option_id, explanation, model_answer, rubric)
  values (
    v_id, v_correct,
    nullif(p_data ->> 'explanation', ''),
    case when v_type = 'cq' then nullif(p_data ->> 'model_answer', '') end,
    case when v_type = 'cq' then nullif(p_data ->> 'rubric', '') end);

  return v_id;
end;
$$;

create or replace function public.set_exam_chapters(p_exam_id uuid, p_chapter_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.exams where id = p_exam_id) then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.exam_chapters where exam_id = p_exam_id;
  insert into public.exam_chapters (exam_id, chapter_id)
  select p_exam_id, unnest(coalesce(p_chapter_ids, '{}'));
end;
$$;

revoke all on function public.save_question(uuid, uuid, jsonb), public.set_exam_chapters(uuid, uuid[]) from public, anon;
grant execute on function public.save_question(uuid, uuid, jsonb), public.set_exam_chapters(uuid, uuid[]) to authenticated;
