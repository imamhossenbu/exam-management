import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

/**
 * Runs SQL against the linked Supabase project through the Supabase CLI
 * (Management API, uses the developer's `supabase login`). No keys are read
 * or stored by the test suite.
 */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "--output-format", "json", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  return (json.rows ?? []) as T[];
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

export const E2E_EMAIL_PATTERN = "e2e-%@example.com";
export const E2E_COURSE_PREFIX = "E2E ";

export type TestUser = { id: string; email: string; password: string; name: string };

/** Creates an already-confirmed student account (the signup trigger makes it a student). */
export function createConfirmedStudent(name: string): TestUser {
  const email = `e2e-${name.toLowerCase().replace(/\W+/g, "-")}-${randomBytes(3).toString("hex")}@example.com`;
  const password = `E2e!${randomBytes(9).toString("base64url")}`;
  const [row] = sql<{ user_id: string }>(`
    with u as (
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${lit(email)}, extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', ${lit(name)}), now(), now(),
        '', '', '', '', '', '', '', ''
      ) returning id, email
    )
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
    from u returning user_id`);
  return { id: row.user_id, email, password, name };
}

/** Removes every row created by the E2E suite: test students, "E2E " courses and everything under them. */
export function cleanupE2EData() {
  sql(`
    begin;
    set local session_replication_role = replica;
    create temp table x_users on commit drop as select id from auth.users where email like ${lit(E2E_EMAIL_PATTERN)};
    create temp table x_courses on commit drop as select id from public.courses where title like ${lit(E2E_COURSE_PREFIX + "%")};
    create temp table x_exams on commit drop as select id from public.exams where course_id in (select id from x_courses);
    create temp table x_attempts on commit drop as
      select id from public.exam_attempts where exam_id in (select id from x_exams) or student_id in (select id from x_users);
    create temp table x_questions on commit drop as select id from public.questions where exam_id in (select id from x_exams);
    delete from app_private.notifications_sent where exam_id in (select id from x_exams) or student_id in (select id from x_users);
    delete from public.answer_annotations where attempt_id in (select id from x_attempts);
    delete from public.grades where attempt_id in (select id from x_attempts);
    delete from public.attempt_events where attempt_id in (select id from x_attempts);
    delete from public.attempt_results where attempt_id in (select id from x_attempts);
    delete from public.student_answers where attempt_id in (select id from x_attempts);
    delete from public.answer_files where attempt_id in (select id from x_attempts);
    delete from public.exam_attempts where id in (select id from x_attempts);
    delete from public.question_answer_keys where question_id in (select id from x_questions);
    delete from public.question_options where question_id in (select id from x_questions);
    delete from public.question_parts where question_id in (select id from x_questions);
    delete from public.questions where id in (select id from x_questions);
    delete from public.exam_chapters where exam_id in (select id from x_exams);
    delete from public.question_sources where course_id in (select id from x_courses) or exam_id in (select id from x_exams);
    delete from public.audit_logs where entity_id::text in (select id::text from x_exams union all select id::text from x_courses union all select id::text from x_attempts);
    delete from public.audit_logs where actor_id in (select id from x_users)
      or (entity_type = 'question' and entity_id in (select id from x_questions))
      or (entity_type = 'course_member' and entity_id in (
            select id from public.course_members where course_id in (select id from x_courses) or student_id in (select id from x_users)))
      or details->>'course_id' in (select id::text from x_courses)
      or details->>'source_exam_id' in (select id::text from x_exams);
    delete from public.exams where id in (select id from x_exams);
    delete from public.course_members where course_id in (select id from x_courses) or student_id in (select id from x_users);
    delete from public.course_invites where course_id in (select id from x_courses);
    delete from public.chapters where subject_id in (select id from public.subjects where course_id in (select id from x_courses));
    delete from public.subjects where course_id in (select id from x_courses);
    delete from public.courses where id in (select id from x_courses);
    delete from public.study_files where owner_id in (select id from x_users);
    delete from public.study_notes where owner_id in (select id from x_users);
    delete from app_private.invite_attempts where user_id in (select id from x_users);
    delete from app_private.rate_limits where user_id in (select id from x_users);
    delete from storage.objects where bucket_id = 'answer-sheets' and (storage.foldername(name))[1] in (select id::text from x_users);
    delete from storage.objects where bucket_id = 'question-assets' and (storage.foldername(name))[1] in (select id::text from x_exams);
    delete from storage.objects where bucket_id = 'avatars' and (storage.foldername(name))[1] in (select id::text from x_users);
    delete from public.profiles where id in (select id from x_users);
    delete from auth.identities where user_id in (select id from x_users);
    delete from auth.users where id in (select id from x_users);
    commit;`);
}

/** Counts leftovers so teardown can prove the cleanup worked. */
export function countE2EData() {
  const [row] = sql<{ users: number; courses: number }>(`
    select (select count(*) from auth.users where email like ${lit(E2E_EMAIL_PATTERN)})::int as users,
           (select count(*) from public.courses where title like ${lit(E2E_COURSE_PREFIX + "%")})::int as courses`);
  return row;
}
