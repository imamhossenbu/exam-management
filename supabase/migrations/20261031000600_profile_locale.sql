-- =============================================================================
-- Interface language per user (Bangla by default). The app mirrors it in a
-- `lang` cookie so every device the user signs in on uses their choice.
-- =============================================================================
alter table public.profiles
  add column locale text not null default 'bn' check (locale in ('bn', 'en'));

grant update (locale) on public.profiles to authenticated;
