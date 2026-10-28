-- =============================================================================
-- Private storage buckets and policies. Object paths encode ownership and are
-- validated against database state; obscure filenames are NOT relied upon.
--
--   question-assets   {exam_id}/{uuid}.{ext}                 teacher write; students with an attempt read
--   question-sources  {teacher_id}/{uuid}.{ext}              teacher only
--   answer-sheets     {student_id}/{attempt_id}/{uuid}.{ext}  owner while open; teacher read
--   study-files       {owner_id}/{note_id}/{uuid}.{ext}       owner only
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-assets', 'question-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('question-sources', 'question-sources', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('answer-sheets', 'answer-sheets', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('study-files', 'study-files', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.path_segment(p_name text, p_index integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select split_part(p_name, '/', p_index);
$$;
grant execute on function app_private.path_segment(text, integer) to authenticated;

-- A student may read a question asset when the asset is referenced by a
-- question (or option) of an exam they have an attempt on.
create or replace function app_private.student_can_read_question_asset(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_attempt(app_private.try_uuid(app_private.path_segment(p_name, 1)))
    and (
      exists (select 1 from public.questions q where q.image_path = p_name)
      or exists (select 1 from public.question_options o where o.image_path = p_name)
    );
$$;
grant execute on function app_private.student_can_read_question_asset(text) to authenticated;

-- question-assets ---------------------------------------------------------
create policy "question assets: teacher manage" on storage.objects for all to authenticated
  using (bucket_id = 'question-assets'
         and app_private.owns_exam(app_private.try_uuid(app_private.path_segment(name, 1))))
  with check (bucket_id = 'question-assets'
              and app_private.owns_exam(app_private.try_uuid(app_private.path_segment(name, 1))));

create policy "question assets: student read" on storage.objects for select to authenticated
  using (bucket_id = 'question-assets' and app_private.student_can_read_question_asset(name));

-- question-sources --------------------------------------------------------
create policy "question sources: teacher manage" on storage.objects for all to authenticated
  using (bucket_id = 'question-sources'
         and app_private.path_segment(name, 1) = (select auth.uid())::text
         and (select app_private.is_teacher()))
  with check (bucket_id = 'question-sources'
              and app_private.path_segment(name, 1) = (select auth.uid())::text
              and (select app_private.is_teacher()));

-- answer-sheets -----------------------------------------------------------
create policy "answer sheets: student upload while open" on storage.objects for insert to authenticated
  with check (bucket_id = 'answer-sheets'
              and app_private.path_segment(name, 1) = (select auth.uid())::text
              and app_private.can_upload_answer(app_private.try_uuid(app_private.path_segment(name, 2))));

create policy "answer sheets: student read own" on storage.objects for select to authenticated
  using (bucket_id = 'answer-sheets'
         and app_private.path_segment(name, 1) = (select auth.uid())::text
         and app_private.owns_attempt(app_private.try_uuid(app_private.path_segment(name, 2))));

create policy "answer sheets: student delete while open" on storage.objects for delete to authenticated
  using (bucket_id = 'answer-sheets'
         and app_private.path_segment(name, 1) = (select auth.uid())::text
         and app_private.can_upload_answer(app_private.try_uuid(app_private.path_segment(name, 2)))
         and not exists (select 1 from public.answer_files f where f.storage_path = name));

create policy "answer sheets: teacher read" on storage.objects for select to authenticated
  using (bucket_id = 'answer-sheets'
         and app_private.teaches_attempt(app_private.try_uuid(app_private.path_segment(name, 2))));

-- study-files -------------------------------------------------------------
create policy "study files: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'study-files' and app_private.path_segment(name, 1) = (select auth.uid())::text);

create policy "study files: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'study-files'
              and app_private.path_segment(name, 1) = (select auth.uid())::text
              and exists (
                select 1 from public.study_notes n
                where n.id = app_private.try_uuid(app_private.path_segment(name, 2))
                  and n.owner_id = (select auth.uid())
              ));

create policy "study files: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'study-files' and app_private.path_segment(name, 1) = (select auth.uid())::text);
