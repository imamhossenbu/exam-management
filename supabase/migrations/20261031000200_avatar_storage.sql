-- =============================================================================
-- Profile photos in Supabase Storage.
--
-- Avatars used to be written to the web server's public/ folder at runtime.
-- Next.js only serves public/ files that exist at build time (runtime files
-- return 404) and serverless hosts have no writable disk, so uploads "worked"
-- but never showed. They now live in a public-read bucket:
--   avatars   {user_id}/{timestamp}.webp   owner writes; anyone can read
-- A new file name per upload means browsers never show a stale cached photo.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app_private.path_segment(name, 1) = (select auth.uid())::text);

create policy "avatars: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app_private.path_segment(name, 1) = (select auth.uid())::text);

create policy "avatars: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and app_private.path_segment(name, 1) = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and app_private.path_segment(name, 1) = (select auth.uid())::text);

create policy "avatars: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and app_private.path_segment(name, 1) = (select auth.uid())::text);
