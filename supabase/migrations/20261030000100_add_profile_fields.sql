-- =============================================================================
-- Migration: Add extended profile fields (avatar_url, student_class, phone)
-- =============================================================================

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists student_class text check (student_class is null or char_length(student_class) <= 80),
  add column if not exists phone text check (phone is null or char_length(phone) <= 30);

-- Allow authenticated users to update their own avatar, class and phone
grant update (full_name, timezone, avatar_url, student_class, phone) on public.profiles to authenticated;
