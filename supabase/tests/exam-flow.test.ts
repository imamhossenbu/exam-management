import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, expireAttempt, hashInvite, seedPublishedExam, type Uid } from "./helpers/db";

let db: TestDb;
let teacher: Uid;
let alice: Uid;
let bob: Uid;
let outsider: Uid;
let courseId: string;

type Result = { total_score: string; mcq_score: string; cq_score: string; percentage: string; grading_status: string; passed: boolean | null };

async function start(uid: Uid, examId: string) {
  const [row] = await db.as<{ start_attempt: string }>(uid, "select public.start_attempt($1)", [examId]);
  return row.start_attempt;
}

async function save(uid: Uid, attemptId: string, questionId: string, optionId: string | null, revision: number) {
  const [row] = await db.as<{ status: string; revision: number }>(
    uid,
    "select * from public.save_answer($1, $2, $3, null, false, $4)",
    [attemptId, questionId, optionId, revision],
  );
  return row;
}

beforeAll(async () => {
  db = await TestDb.create();
  teacher = await db.createTeacher();
  alice = await db.createUser("alice@example.com");
  bob = await db.createUser("bob@example.com");
  outsider = await db.createUser("outsider@example.com");
  const [course] = await db.as<{ id: string }>(
    teacher,
    "insert into public.courses (teacher_id, title) values ($1, 'Chemistry') returning id",
    [teacher],
  );
  courseId = course.id;
  await db.as(
    teacher,
    "insert into public.course_invites (course_id, code_hash, code_hint, created_by) values ($1, $2, 'AAAA', $3)",
    [courseId, hashInvite("JOIN-CHEM-AAAA"), teacher],
  );
  for (const s of [alice, bob]) {
    await db.as(s, "select * from public.redeem_course_invite('JOIN-CHEM-AAAA')");
  }
});

afterAll(async () => {
  await db?.destroy();
});

describe("exam builder and publication", () => {
  let draftId: string;

  beforeAll(async () => {
    const [exam] = await db.as<{ id: string }>(
      teacher,
      `insert into public.exams (course_id, title, exam_type, total_marks, duration_minutes, starts_at, ends_at)
       values ($1, 'Draft exam', 'mcq', 10, 20, now() - interval '1 hour', now() + interval '1 hour') returning id`,
      [courseId],
    );
    draftId = exam.id;
    await db.as(
      teacher,
      "insert into public.questions (exam_id, type, body, marks) values ($1, 'mcq', 'Q1', 4)",
      [draftId],
    );
  });

  it("hides draft exams from enrolled students", async () => {
    expect(await db.as(alice, "select id from public.exams where id = $1", [draftId])).toHaveLength(0);
  });

  it("refuses to publish when marks do not add up or answer keys are missing", async () => {
    const [{ validate_exam_for_publish: problems }] = await db.as<{ validate_exam_for_publish: string[] }>(
      teacher,
      "select public.validate_exam_for_publish($1)",
      [draftId],
    );
    expect(problems.join(" ")).toMatch(/add up to 4.00 but the exam total is 10.00/);
    expect(problems.join(" ")).toMatch(/at least two options/);
    expect(problems.join(" ")).toMatch(/no correct option/);
    await expect(db.as(teacher, "select public.publish_exam($1)", [draftId])).rejects.toThrow(/EXAM_INVALID/);
  });

  it("reports plain problems (no questions, past end time) instead of crashing", async () => {
    const [empty] = await db.as<{ id: string }>(
      teacher,
      `insert into public.exams (course_id, title, exam_type, total_marks, duration_minutes, starts_at, ends_at)
       values ($1, 'Empty', 'mcq', 10, 20, now() - interval '2 hours', now() - interval '1 hour') returning id`,
      [courseId],
    );
    const [{ validate_exam_for_publish: problems }] = await db.as<{ validate_exam_for_publish: string[] }>(
      teacher,
      "select public.validate_exam_for_publish($1)",
      [empty.id],
    );
    expect(problems).toContain("The exam has no questions.");
    expect(problems).toContain("The exam end time is in the past.");
  });

  it("does not let students call teacher operations", async () => {
    await expect(db.as(alice, "select public.publish_exam($1)", [draftId])).rejects.toThrow(/FORBIDDEN/);
    await expect(db.as(alice, "select public.finalize_expired_attempts()")).rejects.toThrow(/FORBIDDEN/);
  });

  it("does not let the teacher set status directly (must use publish_exam)", async () => {
    await expect(db.as(teacher, "update public.exams set status = 'published' where id = $1", [draftId])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("locks question content once an exam is published", async () => {
    const { examId, mcq } = await seedPublishedExam(db, teacher, courseId);
    await expect(
      db.as(teacher, "update public.questions set marks = 5 where id = $1", [mcq[0].id]),
    ).rejects.toThrow(/EXAM_LOCKED/);
    await expect(
      db.as(teacher, "update public.question_answer_keys set correct_option_id = $2 where question_id = $1", [
        mcq[0].id,
        mcq[0].wrong,
      ]),
    ).rejects.toThrow(/EXAM_LOCKED/);
    await expect(db.as(teacher, "update public.exams set total_marks = 99 where id = $1", [examId])).rejects.toThrow(
      /EXAM_SETTINGS_LOCKED/,
    );
    await expect(db.as(teacher, "delete from public.exams where id = $1", [examId])).rejects.toThrow(/EXAM_NOT_DELETABLE/);
  });

  it("duplicates a published exam into an editable draft with answer keys remapped", async () => {
    const { examId } = await seedPublishedExam(db, teacher, courseId);
    const [{ duplicate_exam: copyId }] = await db.as<{ duplicate_exam: string }>(
      teacher,
      "select public.duplicate_exam($1)",
      [examId],
    );
    const keys = await db.sql<{ ok: boolean }>(
      `select (o.question_id = k.question_id) as ok
       from public.question_answer_keys k
       join public.questions q on q.id = k.question_id
       join public.question_options o on o.id = k.correct_option_id
       where q.exam_id = $1`,
      [copyId],
    );
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.ok)).toBe(true);
    await db.as(teacher, "update public.questions set marks = marks where exam_id = $1", [copyId]);
  });
});

describe("answer-key secrecy", () => {
  let examId: string;
  let attemptId: string;

  beforeAll(async () => {
    ({ examId } = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }, { marks: 1 }], cq: [{ marks: 3 }] }));
  });

  it("does not show questions before the student starts", async () => {
    expect(await db.as(alice, "select id from public.questions where exam_id = $1", [examId])).toHaveLength(0);
  });

  it("never returns answer keys, explanations or rubrics to students", async () => {
    attemptId = await start(alice, examId);
    expect(await db.as(alice, "select id from public.questions where exam_id = $1", [examId])).toHaveLength(3);
    expect(await db.as(alice, "select * from public.question_answer_keys")).toHaveLength(0);
    const optionColumns = await db.as(alice, "select * from public.question_options limit 1");
    expect(Object.keys(optionColumns[0])).not.toContain("is_correct");
    const released = await db.as(alice, "select * from public.get_released_answer_keys($1)", [attemptId]);
    expect(released).toHaveLength(0);
  });

  it("does not show questions to an unenrolled user", async () => {
    expect(await db.as(outsider, "select id from public.exams where id = $1", [examId])).toHaveLength(0);
    await expect(db.as(outsider, "select public.start_attempt($1)", [examId])).rejects.toThrow(/EXAM_NOT_FOUND/);
  });

  it("does not leak another student's attempt or answers", async () => {
    expect(await db.as(bob, "select id from public.exam_attempts where id = $1", [attemptId])).toHaveLength(0);
    expect(await db.as(bob, "select id from public.student_answers where attempt_id = $1", [attemptId])).toHaveLength(0);
  });
});

describe("attempts, autosave and submission", () => {
  let exam: Awaited<ReturnType<typeof seedPublishedExam>>;
  let attemptId: string;

  beforeAll(async () => {
    exam = await seedPublishedExam(db, teacher, courseId, {
      mcq: [{ marks: 2, negative: 0.5 }, { marks: 2, negative: 0.5 }, { marks: 2, negative: 0.5 }],
      maxAttempts: 1,
      passMarks: 3,
    });
  });

  it("refuses exams that have not started yet", async () => {
    const [future] = await db.as<{ id: string }>(
      teacher,
      `insert into public.exams (course_id, title, exam_type, total_marks, duration_minutes, starts_at, ends_at)
       values ($1, 'Future', 'mcq', 1, 10, now() + interval '1 day', now() + interval '2 days') returning id`,
      [courseId],
    );
    const [q] = await db.as<{ id: string }>(teacher, "insert into public.questions (exam_id, type, body, marks) values ($1, 'mcq', 'Q', 1) returning id", [future.id]);
    const opts = await db.as<{ id: string }>(teacher, "insert into public.question_options (question_id, body) values ($1, 'a'), ($1, 'b') returning id", [q.id]);
    await db.as(teacher, "insert into public.question_answer_keys (question_id, correct_option_id) values ($1, $2)", [q.id, opts[0].id]);
    await db.as(teacher, "select public.publish_exam($1)", [future.id]);
    await expect(start(alice, future.id)).rejects.toThrow(/EXAM_NOT_STARTED/);
  });

  it("starts an attempt with a server-computed deadline and resumes it", async () => {
    attemptId = await start(alice, exam.examId);
    expect(await start(alice, exam.examId)).toBe(attemptId);
    const [row] = await db.sql<{ minutes: number }>(
      "select extract(epoch from deadline_at - started_at) / 60 as minutes from public.exam_attempts where id = $1",
      [attemptId],
    );
    expect(Number(row.minutes)).toBeCloseTo(30, 0);
  });

  it("does not allow students to write answers or attempts directly", async () => {
    await expect(
      db.as(alice, "insert into public.student_answers (attempt_id, question_id) values ($1, $2)", [attemptId, exam.mcq[0].id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(alice, "update public.exam_attempts set deadline_at = now() + interval '1 day' where id = $1", [attemptId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(alice, "insert into public.attempt_results (attempt_id, max_score, total_score) values ($1, 6, 6)", [attemptId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("autosaves answers and ignores stale (out-of-order) revisions", async () => {
    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].wrong, 1)).status).toBe("saved");
    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 3)).status).toBe("saved");
    const stale = await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].wrong, 2);
    expect(stale).toMatchObject({ status: "stale", revision: 3 });
    const [stored] = await db.sql<{ selected_option_id: string }>(
      "select selected_option_id from public.student_answers where attempt_id = $1 and question_id = $2",
      [attemptId, exam.mcq[0].id],
    );
    expect(stored.selected_option_id).toBe(exam.mcq[0].correct);
  });

  it("rejects options that belong to a different question", async () => {
    await expect(save(alice, attemptId, exam.mcq[1].id, exam.mcq[0].correct, 1)).rejects.toThrow(/INVALID_OPTION/);
  });

  it("rejects saves into someone else's attempt", async () => {
    await expect(save(bob, attemptId, exam.mcq[1].id, exam.mcq[1].correct, 1)).rejects.toThrow(/ATTEMPT_NOT_FOUND/);
  });

  it("grades MCQs on the server with negative marking and handles unanswered questions", async () => {
    await save(alice, attemptId, exam.mcq[1].id, exam.mcq[1].wrong, 1);
    // mcq[2] left unanswered
    const [{ submit_attempt: status }] = await db.as<{ submit_attempt: string }>(alice, "select public.submit_attempt($1)", [attemptId]);
    expect(status).toBe("submitted");

    const grades = await db.sql<{ question_id: string; marks_awarded: string }>(
      "select question_id, marks_awarded from public.grades where attempt_id = $1",
      [attemptId],
    );
    const byQ = Object.fromEntries(grades.map((g) => [g.question_id, Number(g.marks_awarded)]));
    expect(byQ[exam.mcq[0].id]).toBe(2);
    expect(byQ[exam.mcq[1].id]).toBe(-0.5);
    expect(byQ[exam.mcq[2].id]).toBe(0);

    const [result] = await db.as<Result>(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(Number(result.total_score)).toBe(1.5);
    expect(Number(result.percentage)).toBe(25);
    expect(result.passed).toBe(false);
    expect(result.grading_status).toBe("graded");
  });

  it("treats a second submission as idempotent and never double-grades", async () => {
    const [{ submit_attempt: status }] = await db.as<{ submit_attempt: string }>(alice, "select public.submit_attempt($1)", [attemptId]);
    expect(status).toBe("already_submitted");
    const [{ count }] = await db.sql<{ count: string }>("select count(*) from public.grades where attempt_id = $1", [attemptId]);
    expect(Number(count)).toBe(3);
  });

  it("locks answers after submission", async () => {
    expect((await save(alice, attemptId, exam.mcq[2].id, exam.mcq[2].correct, 5)).status).toBe("finalized");
  });

  it("enforces the attempt limit", async () => {
    await expect(start(alice, exam.examId)).rejects.toThrow(/ATTEMPT_LIMIT_REACHED/);
  });

  it("finalizes expired attempts on the server and rejects late answers", async () => {
    const bobAttempt = await start(bob, exam.examId);
    await save(bob, bobAttempt, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await expireAttempt(db, bobAttempt);
    expect((await save(bob, bobAttempt, exam.mcq[1].id, exam.mcq[1].correct, 1)).status).toBe("deadline_passed");
    const [attempt] = await db.sql<{ status: string; submitted_via: string }>(
      "select status, submitted_via from public.exam_attempts where id = $1",
      [bobAttempt],
    );
    expect(attempt).toEqual({ status: "submitted", submitted_via: "timeout" });
    const [result] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [bobAttempt]);
    expect(Number(result.total_score)).toBe(2);
  });

  it("finalizes abandoned attempts via the scheduled job", async () => {
    const extra = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const id = await start(alice, extra.examId);
    await expireAttempt(db, id);
    const [{ finalize_expired_attempts: n }] = await db.as<{ finalize_expired_attempts: number }>(
      teacher,
      "select public.finalize_expired_attempts()",
    );
    expect(n).toBeGreaterThanOrEqual(1);
    const [attempt] = await db.sql<{ status: string }>("select status from public.exam_attempts where id = $1", [id]);
    expect(attempt.status).toBe("submitted");
  });

  it("never lets negative marking push the total below zero", async () => {
    const neg = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1, negative: 1 }, { marks: 1, negative: 1 }] });
    const id = await start(alice, neg.examId);
    await save(alice, id, neg.mcq[0].id, neg.mcq[0].wrong, 1);
    await save(alice, id, neg.mcq[1].id, neg.mcq[1].wrong, 1);
    await db.as(alice, "select public.submit_attempt($1)", [id]);
    const [result] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [id]);
    expect(Number(result.mcq_score)).toBe(-2);
    expect(Number(result.total_score)).toBe(0);
  });
});

describe("result visibility and CQ grading", () => {
  let exam: Awaited<ReturnType<typeof seedPublishedExam>>;
  let attemptId: string;

  beforeAll(async () => {
    exam = await seedPublishedExam(db, teacher, courseId, {
      release: "manual",
      mcq: [{ marks: 2 }],
      cq: [{ marks: 8, parts: [3, 5] }],
    });
    attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
  });

  it("keeps mixed attempts pending until CQ grading is complete", async () => {
    const [r] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(r.grading_status).toBe("pending");
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
  });

  it("does not let students grade", async () => {
    await expect(
      db.as(alice, "select public.save_cq_grade($1, $2, $3, 3, 'great')", [attemptId, exam.cq[0].id, exam.cq[0].parts[0]]),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(db.as(alice, "select public.finalize_grading($1)", [attemptId])).rejects.toThrow(/FORBIDDEN/);
  });

  it("validates marks per sub-question", async () => {
    await expect(
      db.as(teacher, "select public.save_cq_grade($1, $2, $3, 4, null)", [attemptId, exam.cq[0].id, exam.cq[0].parts[0]]),
    ).rejects.toThrow(/INVALID_MARKS/);
    await expect(
      db.as(teacher, "select public.save_cq_grade($1, $2, null, 4, null)", [attemptId, exam.cq[0].id]),
    ).rejects.toThrow(/PART_REQUIRED/);
  });

  it("refuses to finalize incomplete grading", async () => {
    await db.as(teacher, "select public.save_cq_grade($1, $2, $3, 2.5, 'Good start')", [attemptId, exam.cq[0].id, exam.cq[0].parts[0]]);
    await expect(db.as(teacher, "select public.finalize_grading($1)", [attemptId])).rejects.toThrow(/GRADING_INCOMPLETE/);
    const [r] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(r.grading_status).toBe("in_review");
  });

  it("hides draft grades from the student", async () => {
    expect(await db.as(alice, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(0);
  });

  it("finalizes grading and computes totals", async () => {
    await db.as(teacher, "select public.save_cq_grade($1, $2, $3, 4, 'Clear diagram')", [attemptId, exam.cq[0].id, exam.cq[0].parts[1]]);
    await db.as(teacher, "select public.finalize_grading($1)", [attemptId]);
    const [r] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(r.grading_status).toBe("graded");
    expect(Number(r.mcq_score)).toBe(2);
    expect(Number(r.cq_score)).toBe(6.5);
    expect(Number(r.total_score)).toBe(8.5);
  });

  it("withholds results until the teacher publishes them (manual release)", async () => {
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
    await db.as(teacher, "select public.publish_results($1)", [exam.examId]);
    const rows = await db.as<Result>(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(rows).toHaveLength(1);
    expect(await db.as(alice, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(3);
  });

  it("keeps released results private from other students", async () => {
    expect(await db.as(bob, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
    expect(await db.as(bob, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(0);
  });

  it("reveals answer keys only after the exam window has closed", async () => {
    expect(await db.as(alice, "select * from public.get_released_answer_keys($1)", [attemptId])).toHaveLength(0);
    await db.as(teacher, "select public.close_exam($1)", [exam.examId]);
    const keys = await db.as<{ model_answer: string | null }>(alice, "select * from public.get_released_answer_keys($1)", [attemptId]);
    expect(keys).toHaveLength(2);
    expect(await db.as(bob, "select * from public.get_released_answer_keys($1)", [attemptId])).toHaveLength(0);
  });

  it("supports an audited answer-key correction that regrades attempts", async () => {
    const [{ correct_answer_key: n }] = await db.as<{ correct_answer_key: number }>(
      teacher,
      "select public.correct_answer_key($1, $2)",
      [exam.mcq[0].id, exam.mcq[0].wrong],
    );
    expect(n).toBe(1);
    const [r] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(Number(r.mcq_score)).toBe(0);
    const audit = await db.sql("select * from public.audit_logs where action = 'answer_key.corrected'");
    expect(audit).toHaveLength(1);
  });
});

describe("concurrency", () => {
  it("creates exactly one attempt for concurrent starts", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }], maxAttempts: 3 });
    const ids = await Promise.all(Array.from({ length: 5 }, () => start(bob, exam.examId)));
    expect(new Set(ids).size).toBe(1);
    const [{ count }] = await db.sql<{ count: string }>(
      "select count(*) from public.exam_attempts where exam_id = $1 and student_id = $2",
      [exam.examId, bob],
    );
    expect(Number(count)).toBe(1);
  });

  it("handles concurrent submissions idempotently", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const id = await start(alice, exam.examId);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        db.as<{ submit_attempt: string }>(alice, "select public.submit_attempt($1)", [id]).then((r) => r[0].submit_attempt),
      ),
    );
    expect(results.filter((r) => r === "submitted")).toHaveLength(1);
    expect(results.filter((r) => r === "already_submitted")).toHaveLength(3);
  });
});

describe("transactional question editing", () => {
  let examId: string;
  const payload = {
    type: "mcq",
    body: "Capital of France?",
    marks: 2,
    negative_marks: 0.5,
    options: [
      { body: "Paris", is_correct: true },
      { body: "Rome", is_correct: false },
    ],
    explanation: "Paris is the capital.",
  };

  beforeAll(async () => {
    const [exam] = await db.as<{ id: string }>(
      teacher,
      `insert into public.exams (course_id, title, exam_type, total_marks, duration_minutes, starts_at, ends_at)
       values ($1, 'Editable', 'mcq', 2, 10, now() - interval '1 hour', now() + interval '1 hour') returning id`,
      [courseId],
    );
    examId = exam.id;
  });

  it("creates a question with options and a private key atomically", async () => {
    const [{ save_question: id }] = await db.as<{ save_question: string }>(teacher, "select public.save_question($1, null, $2)", [
      examId,
      JSON.stringify(payload),
    ]);
    const [key] = await db.sql<{ body: string }>(
      "select o.body from public.question_answer_keys k join public.question_options o on o.id = k.correct_option_id where k.question_id = $1",
      [id],
    );
    expect(key.body).toBe("Paris");
    const [{ validate_exam_for_publish: problems }] = await db.as<{ validate_exam_for_publish: string[] }>(
      teacher,
      "select public.validate_exam_for_publish($1)",
      [examId],
    );
    expect(problems).toEqual([]);
  });

  it("rolls back entirely when the payload is invalid", async () => {
    const bad = { ...payload, options: [{ body: "A", is_correct: true }, { body: "B", is_correct: true }] };
    await expect(db.as(teacher, "select public.save_question($1, null, $2)", [examId, JSON.stringify(bad)])).rejects.toThrow(/INVALID_OPTION/);
    const [{ count }] = await db.sql<{ count: string }>("select count(*) from public.questions where exam_id = $1", [examId]);
    expect(Number(count)).toBe(1);
  });

  it("rejects question writes from students", async () => {
    await expect(db.as(alice, "select public.save_question($1, null, $2)", [examId, JSON.stringify(payload)])).rejects.toThrow();
  });

  it("refuses edits once the exam is published", async () => {
    await db.as(teacher, "select public.publish_exam($1)", [examId]);
    await expect(db.as(teacher, "select public.save_question($1, null, $2)", [examId, JSON.stringify(payload)])).rejects.toThrow(/EXAM_LOCKED/);
  });
});

describe("timed MCQ section (mixed exams)", () => {
  async function cqSave(uid: Uid, attemptId: string, questionId: string, text: string, revision: number) {
    const [row] = await db.as<{ status: string }>(
      uid,
      "select * from public.save_answer($1, $2, null, $3, false, $4)",
      [attemptId, questionId, text, revision],
    );
    return row;
  }

  it("only allows a section time on mixed exams and below the overall duration", async () => {
    const insert = (type: string, duration: number, mcq: number) =>
      db.as(
        teacher,
        `insert into public.exams (course_id, title, exam_type, total_marks, duration_minutes, mcq_duration_minutes, starts_at, ends_at)
         values ($1, 'Sectioned', $2, 10, $3, $4, now(), now() + interval '1 day')`,
        [courseId, type, duration, mcq],
      );
    await expect(insert("mcq", 60, 20)).rejects.toThrow(/exams_mcq_duration_check/);
    await expect(insert("mixed", 60, 60)).rejects.toThrow(/exams_mcq_duration_check/);
    await expect(insert("mixed", 60, 20)).resolves.toBeDefined();
  });

  it("refuses to publish a timed MCQ section without written questions", async () => {
    await expect(
      seedPublishedExam(db, teacher, courseId, { type: "mixed", mcqDurationMinutes: 10, durationMinutes: 30 }),
    ).rejects.toThrow(/EXAM_INVALID/);
  });

  it("puts every MCQ first, gives them their own deadline and locks them afterwards", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, {
      durationMinutes: 60,
      mcqDurationMinutes: 15,
      shuffleQuestions: true,
      mcq: [{ marks: 1 }, { marks: 1 }, { marks: 1 }],
      cq: [{ marks: 5 }, { marks: 5 }],
    });
    const attemptId = await start(alice, exam.examId);
    const [a] = await db.sql<{ question_order: string[]; section: number; total: number }>(
      `select question_order,
         extract(epoch from mcq_deadline_at - started_at) / 60 as section,
         extract(epoch from deadline_at - started_at) / 60 as total
       from public.exam_attempts where id = $1`,
      [attemptId],
    );
    expect(Math.round(a.section)).toBe(15);
    expect(Math.round(a.total)).toBe(60);
    const mcqIds = new Set(exam.mcq.map((q) => q.id));
    expect(a.question_order.slice(0, 3).every((id) => mcqIds.has(id))).toBe(true);

    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1)).status).toBe("saved");

    // MCQ time is up (past the grace period too).
    await db.sql(
      "update public.exam_attempts set started_at = now() - interval '20 minutes', mcq_deadline_at = now() - interval '1 minute' where id = $1",
      [attemptId],
    );
    const late = await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].wrong, 2);
    expect(late.status).toBe("section_closed");
    expect(late.revision).toBe(1);
    expect((await save(alice, attemptId, exam.mcq[1].id, exam.mcq[1].correct, 1)).status).toBe("section_closed");

    // The written part is still open, and the attempt is not finalized.
    expect((await cqSave(alice, attemptId, exam.cq[0].id, "Answer", 1)).status).toBe("saved");
    const [state] = await db.sql<{ status: string }>("select status from public.exam_attempts where id = $1", [attemptId]);
    expect(state.status).toBe("in_progress");

    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
    const [r] = await db.sql<Result>("select * from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(Number(r.mcq_score)).toBe(1); // only the in-time answer counts
  });

  it("lets the student hand in the MCQ section early, once, and only their own", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, {
      durationMinutes: 60,
      mcqDurationMinutes: 15,
      mcq: [{ marks: 1 }],
      cq: [{ marks: 5 }],
    });
    const attemptId = await start(bob, exam.examId);
    await expect(db.as(alice, "select public.end_mcq_section($1)", [attemptId])).rejects.toThrow(/ATTEMPT_NOT_FOUND/);

    const [{ end_mcq_section: first }] = await db.as<{ end_mcq_section: Date }>(bob, "select public.end_mcq_section($1)", [attemptId]);
    const [{ end_mcq_section: second }] = await db.as<{ end_mcq_section: Date }>(bob, "select public.end_mcq_section($1)", [attemptId]);
    expect(second.getTime()).toBe(first.getTime());
    expect(first.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    // Inside the network grace an in-flight MCQ save is still accepted; after it, refused.
    expect((await save(bob, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1)).status).toBe("saved");
    await db.sql(
      "update public.exam_attempts set started_at = now() - interval '2 minutes', mcq_deadline_at = now() - interval '1 minute' where id = $1",
      [attemptId],
    );
    expect((await save(bob, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1)).status).toBe("section_closed");
    await expect(db.as(bob, "select public.end_mcq_section($1)", [attemptId])).resolves.toBeDefined();
  });

  it("rejects ending a section on exams without one", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }], cq: [{ marks: 1 }] });
    const attemptId = await start(alice, exam.examId);
    await expect(db.as(alice, "select public.end_mcq_section($1)", [attemptId])).rejects.toThrow(/NO_MCQ_SECTION/);
    const [a] = await db.sql<{ mcq_deadline_at: Date | null }>("select mcq_deadline_at from public.exam_attempts where id = $1", [attemptId]);
    expect(a.mcq_deadline_at).toBeNull();
  });

  it("freezes the section time after publishing and keeps it when duplicating", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, {
      durationMinutes: 60,
      mcqDurationMinutes: 20,
      mcq: [{ marks: 1 }],
      cq: [{ marks: 5 }],
    });
    await expect(
      db.as(teacher, "update public.exams set mcq_duration_minutes = 30 where id = $1", [exam.examId]),
    ).rejects.toThrow(/EXAM_SETTINGS_LOCKED/);
    const [{ duplicate_exam: copyId }] = await db.as<{ duplicate_exam: string }>(teacher, "select public.duplicate_exam($1)", [exam.examId]);
    const [copy] = await db.sql<{ mcq_duration_minutes: number }>("select mcq_duration_minutes from public.exams where id = $1", [copyId]);
    expect(copy.mcq_duration_minutes).toBe(20);
  });
});
