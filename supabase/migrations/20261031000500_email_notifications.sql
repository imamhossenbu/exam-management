-- =============================================================================
-- Email notifications: "new exam" and "your result is out".
--
-- The app claims the recipients through these functions and then sends the
-- emails in the background. A claim is recorded once per (kind, exam,
-- student), so nobody gets the same email twice — not on retries, not when
-- results are hidden and published again. If sending fails the app releases
-- the claim so a later trigger can retry.
-- =============================================================================

create table app_private.notifications_sent (
  kind text not null check (kind in ('exam_published', 'result_released')),
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (kind, exam_id, student_id)
);

-- Enrolled, active students of a published exam's course who haven't been told about it yet.
create or replace function public.claim_exam_announcements(p_exam_id uuid)
returns table (student_id uuid, email text, full_name text, timezone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams := app_private.require_exam_owner(p_exam_id);
begin
  if v_exam.status <> 'published' then
    return;
  end if;
  return query
  with claimed as (
    insert into app_private.notifications_sent (kind, exam_id, student_id)
    select 'exam_published', v_exam.id, m.student_id
    from public.course_members m
    join public.profiles p on p.id = m.student_id
    where m.course_id = v_exam.course_id and m.status = 'active' and p.email is not null
    on conflict do nothing
    returning app_private.notifications_sent.student_id
  )
  select p.id, p.email, p.full_name, p.timezone
  from claimed c join public.profiles p on p.id = c.student_id;
end;
$$;

-- Students whose result (their counted attempt) is now visible and who haven't been told yet.
-- The teacher may claim for one exam or all their exams (p_exam_id null); a student only for themselves.
create or replace function public.claim_result_notifications(p_exam_id uuid default null)
returns table (
  student_id uuid, email text, full_name text, exam_id uuid, exam_title text, course_title text,
  attempt_id uuid, total_score numeric, max_score numeric, percentage numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
  v_teacher boolean := app_private.is_teacher();
begin
  if v_teacher and p_exam_id is not null and not app_private.owns_exam(p_exam_id) then
    raise exception 'EXAM_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
  with candidates as (
    select distinct on (a.exam_id, a.student_id) a.id, a.exam_id, a.student_id
    from public.exam_attempts a
    join public.exams e on e.id = a.exam_id
    join public.courses c on c.id = e.course_id
    left join public.attempt_results r on r.attempt_id = a.id
    where a.status <> 'in_progress'
      and (p_exam_id is null or a.exam_id = p_exam_id)
      and (case when v_teacher then c.teacher_id = v_uid else a.student_id = v_uid end)
    order by
      a.exam_id, a.student_id,
      case when e.result_policy = 'best' and r.grading_status = 'graded' then 0 when e.result_policy = 'best' then 1 else 0 end,
      case when e.result_policy = 'best' then r.total_score end desc nulls last,
      a.attempt_number desc
  ),
  visible as (
    select ca.* from candidates ca where app_private.results_visible(ca.id)
  ),
  claimed as (
    insert into app_private.notifications_sent (kind, exam_id, student_id)
    select 'result_released', v.exam_id, v.student_id from visible v
    on conflict do nothing
    returning app_private.notifications_sent.exam_id, app_private.notifications_sent.student_id
  )
  select p.id, p.email, p.full_name, e.id, e.title, c.title, v.id, r.total_score, r.max_score, r.percentage
  from claimed cl
  join visible v on v.exam_id = cl.exam_id and v.student_id = cl.student_id
  join public.profiles p on p.id = cl.student_id
  join public.exams e on e.id = cl.exam_id
  join public.courses c on c.id = e.course_id
  join public.attempt_results r on r.attempt_id = v.id
  where p.email is not null;
end;
$$;

-- Undo claims whose email could not be sent, so a later trigger retries them.
create or replace function public.release_notifications(p_kind text, p_exam_id uuid, p_student_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_uid();
begin
  if not (app_private.owns_exam(p_exam_id) or p_student_ids = array[v_uid]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from app_private.notifications_sent
  where kind = p_kind and exam_id = p_exam_id and student_id = any (p_student_ids);
end;
$$;

revoke all on function public.claim_exam_announcements(uuid), public.claim_result_notifications(uuid),
  public.release_notifications(text, uuid, uuid[]) from public, anon;
grant execute on function public.claim_exam_announcements(uuid), public.claim_result_notifications(uuid),
  public.release_notifications(text, uuid, uuid[]) to authenticated;
