import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, hashInvite, seedPublishedExam, type Uid } from "./helpers/db";

let db: TestDb;
let teacher: Uid;
let alice: Uid;
let bob: Uid;
let carol: Uid;
let courseId: string;
const CODE = "ABCD-2345-EFGH";

beforeAll(async () => {
  db = await TestDb.create();
  teacher = await db.createTeacher();
  alice = await db.createUser("alice@example.com", { full_name: "Alice" });
  bob = await db.createUser("bob@example.com", { full_name: "Bob", role: "teacher" });
  carol = await db.createUser("carol@example.com");
  const [course] = await db.as<{ id: string }>(
    teacher,
    "insert into public.courses (teacher_id, title) values ($1, 'Physics 101') returning id",
    [teacher],
  );
  courseId = course.id;
  await db.as(
    teacher,
    "insert into public.course_invites (course_id, code_hash, code_hint, created_by) values ($1, $2, 'EFGH', $3)",
    [courseId, hashInvite(CODE), teacher],
  );
});

afterAll(async () => {
  await db?.destroy();
});

describe("authentication and roles", () => {
  it("creates every signup as a student, ignoring client-supplied role metadata", async () => {
    const rows = await db.sql<{ role: string }>("select role from public.profiles where id = $1", [bob]);
    expect(rows[0].role).toBe("student");
  });

  it("prevents a student from changing their role", async () => {
    await expect(db.as(alice, "update public.profiles set role = 'teacher' where id = $1", [alice])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lets a user update their own name and timezone, but rejects invalid timezones", async () => {
    await db.as(alice, "update public.profiles set full_name = 'Alice A', timezone = 'Asia/Dhaka' where id = $1", [alice]);
    const [row] = await db.sql<{ full_name: string; timezone: string }>(
      "select full_name, timezone from public.profiles where id = $1",
      [alice],
    );
    expect(row).toEqual({ full_name: "Alice A", timezone: "Asia/Dhaka" });
    await expect(
      db.as(alice, "update public.profiles set timezone = 'Mars/Olympus' where id = $1", [alice]),
    ).rejects.toThrow(/INVALID_TIMEZONE/);
  });

  it("does not let a student update someone else's profile", async () => {
    const rows = await db.as(bob, "update public.profiles set full_name = 'hacked' where id = $1 returning id", [alice]);
    expect(rows).toHaveLength(0);
  });

  it("does not expose teacher provisioning to API roles", async () => {
    await expect(db.as(alice, "select app_private.promote_to_teacher('alice@example.com')")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("allows only one teacher", async () => {
    await expect(db.sql("select app_private.promote_to_teacher('carol@example.com')")).rejects.toThrow(
      /teacher already exists/,
    );
  });

  it("gives anonymous users no table access", async () => {
    await expect(db.as(null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
    await expect(db.as(null, "select * from public.exams")).rejects.toThrow(/permission denied/);
  });

  it("shows students only their own profile", async () => {
    const rows = await db.as<{ id: string }>(alice, "select id from public.profiles");
    expect(rows.map((r) => r.id)).toEqual([alice]);
  });
});

describe("courses and enrollment", () => {
  it("does not allow students to create courses", async () => {
    await expect(
      db.as(alice, "insert into public.courses (teacher_id, title) values ($1, 'Mine')", [alice]),
    ).rejects.toThrow();
  });

  it("hides courses from students who have not joined", async () => {
    const rows = await db.as(alice, "select id from public.courses");
    expect(rows).toHaveLength(0);
  });

  it("never lets students read invitation records", async () => {
    const rows = await db.as(alice, "select * from public.course_invites");
    expect(rows).toHaveLength(0);
  });

  it("rejects an invalid code without revealing anything", async () => {
    const [res] = await db.as<{ status: string; course_id: string | null; course_title: string | null }>(
      alice,
      "select * from public.redeem_course_invite('WRONG-CODE-1')",
    );
    expect(res).toEqual({ status: "invalid", course_id: null, course_title: null });
  });

  it("joins a course with a valid code (case/format-insensitive) and prevents duplicates", async () => {
    const [res] = await db.as<{ status: string; course_id: string }>(
      alice,
      "select * from public.redeem_course_invite('abcd 2345 efgh')",
    );
    expect(res.status).toBe("joined");
    expect(res.course_id).toBe(courseId);

    const [again] = await db.as<{ status: string }>(alice, "select * from public.redeem_course_invite($1)", [CODE]);
    expect(again.status).toBe("already_enrolled");

    const members = await db.sql("select * from public.course_members where course_id = $1 and student_id = $2", [
      courseId,
      alice,
    ]);
    expect(members).toHaveLength(1);
    const [invite] = await db.sql<{ use_count: number }>("select use_count from public.course_invites");
    expect(invite.use_count).toBe(1);
  });

  it("makes the course visible to the enrolled student only", async () => {
    expect(await db.as(alice, "select id from public.courses")).toHaveLength(1);
    expect(await db.as(carol, "select id from public.courses")).toHaveLength(0);
  });

  it("rejects expired, revoked and full invitations", async () => {
    const expired = "EXPI-RED0-0001";
    const revoked = "REVO-KED0-0001";
    const full = "FULL-CODE-0001";
    await db.as(
      teacher,
      `insert into public.course_invites (course_id, code_hash, code_hint, created_by, expires_at, revoked_at, max_uses, use_count)
       values ($1, $2, '0001', $5, now() - interval '1 minute', null, null, 0),
              ($1, $3, '0001', $5, null, now(), null, 0),
              ($1, $4, '0001', $5, null, null, 1, 1)`,
      [courseId, hashInvite(expired), hashInvite(revoked), hashInvite(full), teacher],
    );
    const statuses = [];
    for (const code of [expired, revoked, full]) {
      const [r] = await db.as<{ status: string }>(carol, "select * from public.redeem_course_invite($1)", [code]);
      statuses.push(r.status);
    }
    expect(statuses).toEqual(["invalid", "invalid", "full"]);
  });

  it("rate-limits repeated failed codes (brute-force protection)", async () => {
    const statuses: string[] = [];
    for (let i = 0; i < 9; i++) {
      const [r] = await db.as<{ status: string }>(bob, "select * from public.redeem_course_invite($1)", [`GUESS${i}XXXXX`]);
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 8).every((s) => s === "invalid")).toBe(true);
    expect(statuses[8]).toBe("rate_limited");
    // Even the correct code is refused while rate limited.
    const [r] = await db.as<{ status: string }>(bob, "select * from public.redeem_course_invite($1)", [CODE]);
    expect(r.status).toBe("rate_limited");
  });

  it("blocks suspended students from rejoining via a code", async () => {
    const [res] = await db.as<{ status: string }>(carol, "select * from public.redeem_course_invite($1)", [CODE]);
    expect(res.status).toBe("joined");
    await db.as(teacher, "update public.course_members set status = 'suspended' where student_id = $1", [carol]);
    const [again] = await db.as<{ status: string }>(carol, "select * from public.redeem_course_invite($1)", [CODE]);
    expect(again.status).toBe("suspended");
    expect(await db.as(carol, "select id from public.courses")).toHaveLength(0);
    await db.as(teacher, "update public.course_members set status = 'active' where student_id = $1", [carol]);
  });

  it("does not let students change their own enrollment status", async () => {
    await db.as(teacher, "update public.course_members set status = 'suspended' where student_id = $1", [carol]);
    const updated = await db.as(
      carol,
      "update public.course_members set status = 'active' where student_id = $1 returning id",
      [carol],
    );
    expect(updated).toHaveLength(0);
    const [row] = await db.sql<{ status: string }>("select status from public.course_members where student_id = $1", [carol]);
    expect(row.status).toBe("suspended");
    await db.as(teacher, "update public.course_members set status = 'active' where student_id = $1", [carol]);
  });

  it("audits enrollment changes", async () => {
    const rows = await db.sql<{ action: string }>(
      "select action from public.audit_logs where entity_type = 'course_member' order by id",
    );
    expect(rows.map((r) => r.action)).toContain("enrollment.status_changed");
  });
});

describe("student notes isolation", () => {
  let noteId: string;

  it("lets a student create and search their own notes", async () => {
    const [note] = await db.as<{ id: string }>(
      alice,
      `insert into public.study_notes (owner_id, title, subject, chapter, body, tags)
       values ($1, 'Newton laws', 'Physics', 'Mechanics', 'Force equals mass times acceleration', '{exam,important}') returning id`,
      [alice],
    );
    noteId = note.id;
    const hits = await db.as(alice, "select id from public.study_notes where search @@ websearch_to_tsquery('simple', 'acceleration')");
    expect(hits).toHaveLength(1);
  });

  it("hides notes from other students and from the teacher", async () => {
    expect(await db.as(carol, "select id from public.study_notes")).toHaveLength(0);
    expect(await db.as(teacher, "select id from public.study_notes")).toHaveLength(0);
    expect(await db.as(carol, "delete from public.study_notes where id = $1 returning id", [noteId])).toHaveLength(0);
  });

  it("prevents creating notes for another user", async () => {
    await expect(
      db.as(carol, "insert into public.study_notes (owner_id, title) values ($1, 'x')", [alice]),
    ).rejects.toThrow(/row-level security/);
  });

  it("restricts note attachments in storage to the owner's own notes", async () => {
    await db.as(alice, "insert into storage.objects (bucket_id, name) values ('study-files', $1)", [
      `${alice}/${noteId}/file.png`,
    ]);
    await expect(
      db.as(carol, "insert into storage.objects (bucket_id, name) values ('study-files', $1)", [
        `${carol}/${noteId}/file.png`,
      ]),
    ).rejects.toThrow(/row-level security/);
    expect(await db.as(carol, "select name from storage.objects where bucket_id = 'study-files'")).toHaveLength(0);
    expect(await db.as(teacher, "select name from storage.objects where bucket_id = 'study-files'")).toHaveLength(0);
  });
});

describe("private answer-sheet storage", () => {
  let attemptId: string;

  beforeAll(async () => {
    const { examId } = await seedPublishedExam(db, teacher, courseId, { mcq: [], cq: [{ marks: 10 }] });
    attemptId = (await db.as<{ start_attempt: string }>(alice, "select public.start_attempt($1)", [examId]))[0]
      .start_attempt;
  });

  it("lets the student upload into their own attempt folder while it is open", async () => {
    await db.as(alice, "insert into storage.objects (bucket_id, name) values ('answer-sheets', $1)", [
      `${alice}/${attemptId}/page1.jpg`,
    ]);
  });

  it("blocks uploads into another student's folder or attempt", async () => {
    await expect(
      db.as(carol, "insert into storage.objects (bucket_id, name) values ('answer-sheets', $1)", [
        `${alice}/${attemptId}/evil.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(carol, "insert into storage.objects (bucket_id, name) values ('answer-sheets', $1)", [
        `${carol}/${attemptId}/evil.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets only the owner and the teacher read answer sheets", async () => {
    expect(await db.as(alice, "select name from storage.objects where bucket_id = 'answer-sheets'")).toHaveLength(1);
    expect(await db.as(teacher, "select name from storage.objects where bucket_id = 'answer-sheets'")).toHaveLength(1);
    expect(await db.as(carol, "select name from storage.objects where bucket_id = 'answer-sheets'")).toHaveLength(0);
  });

  it("rejects registering a file path outside the student's attempt folder", async () => {
    const [q] = await db.sql<{ id: string }>(
      "select q.id from public.questions q join public.exam_attempts a on a.exam_id = q.exam_id where a.id = $1",
      [attemptId],
    );
    await expect(
      db.as(alice, "select public.register_answer_file($1, $2, null, $3, 'x.jpg', 'image/jpeg', 100)", [
        attemptId,
        q.id,
        `${carol}/${attemptId}/x.jpg`,
      ]),
    ).rejects.toThrow(/INVALID_STORAGE_PATH/);
    await db.as(alice, "select public.register_answer_file($1, $2, null, $3, 'page1.jpg', 'image/jpeg', 100)", [
      attemptId,
      q.id,
      `${alice}/${attemptId}/page1.jpg`,
    ]);
  });

  it("closes uploads once the attempt is submitted", async () => {
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
    await expect(
      db.as(alice, "insert into storage.objects (bucket_id, name) values ('answer-sheets', $1)", [
        `${alice}/${attemptId}/late.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(alice, "delete from storage.objects where bucket_id = 'answer-sheets' returning name"),
    ).resolves.toHaveLength(0);
  });

  it("keeps question source files private to the teacher", async () => {
    await db.as(teacher, "insert into storage.objects (bucket_id, name) values ('question-sources', $1)", [
      `${teacher}/source.pdf`,
    ]);
    expect(await db.as(alice, "select name from storage.objects where bucket_id = 'question-sources'")).toHaveLength(0);
    await expect(
      db.as(alice, "insert into storage.objects (bucket_id, name) values ('question-sources', $1)", [`${alice}/x.pdf`]),
    ).rejects.toThrow(/row-level security/);
  });
});
