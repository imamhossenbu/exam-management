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
    // Written-part grades show now; the MCQ mark waits for the window to close (it reveals the answer).
    const grades = await db.as<{ is_auto: boolean }>(alice, "select is_auto from public.grades where attempt_id = $1", [attemptId]);
    expect(grades).toHaveLength(2);
    expect(grades.every((g) => !g.is_auto)).toBe(true);
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

    // Handing in closes the section at once (no grace window to keep changing MCQs).
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

describe("exam/result audit fixes", () => {
  const cq = async (uid: Uid, attemptId: string, questionId: string, text: string, revision: number) =>
    (await db.as<{ status: string }>(uid, "select * from public.save_answer($1, $2, null, $3, false, $4)", [attemptId, questionId, text, revision]))[0];
  const submit = (uid: Uid, attemptId: string) => db.as(uid, "select public.submit_attempt($1)", [attemptId]);

  it("hands a returned attempt back to the teacher when the resubmit deadline passes", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [], cq: [{ marks: 5 }], type: "cq" });
    await db.as(teacher, "update public.exams set allow_resubmission = true where id = $1", [exam.examId]);
    const attemptId = await start(alice, exam.examId);
    await cq(alice, attemptId, exam.cq[0].id, "answer", 1);
    await submit(alice, attemptId);
    await db.as(teacher, "select public.return_attempt($1, 'fix it', now() + interval '1 hour')", [attemptId]);
    await db.sql("update public.exam_attempts set resubmit_deadline_at = now() - interval '1 minute' where id = $1", [attemptId]);
    await db.as(teacher, "select public.finalize_expired_attempts()");
    const [a] = await db.sql<{ status: string }>("select status from public.exam_attempts where id = $1", [attemptId]);
    expect(a.status).toBe("submitted");
    await db.as(teacher, "select public.save_cq_grade($1, $2, null, 4, null)", [attemptId, exam.cq[0].id]);
    await db.as(teacher, "select public.finalize_grading($1)", [attemptId]);
  });

  it("keeps per-question MCQ marks hidden until the window closes; totals still show (immediate release)", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { maxAttempts: 2, mcq: [{ marks: 2, negative: 0.5 }, { marks: 2 }] });
    const attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].wrong, 1);
    await save(alice, attemptId, exam.mcq[1].id, exam.mcq[1].correct, 1);
    await submit(alice, attemptId);
    expect(await db.as(alice, "select total_score from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(1);
    expect(await db.as(alice, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(0);
    await db.sql("update public.exams set ends_at = now() - interval '1 minute' where id = $1", [exam.examId]);
    expect(await db.as(alice, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(2);
  });

  it("recomputes pass/fail when the pass mark changes", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { passMarks: 3, mcq: [{ marks: 2 }, { marks: 2 }] });
    const attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await submit(alice, attemptId);
    const passed = async () => (await db.sql<{ passed: boolean }>("select passed from public.attempt_results where attempt_id = $1", [attemptId]))[0].passed;
    expect(await passed()).toBe(false);
    await db.as(teacher, "update public.exams set pass_marks = 1 where id = $1", [exam.examId]);
    expect(await passed()).toBe(true);
  });

  it("moves deadlines of attempts in progress when the window end changes", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { durationMinutes: 600, mcq: [{ marks: 1 }] });
    const attemptId = await start(alice, exam.examId);
    const hoursLeft = async () =>
      (await db.sql<{ h: number }>("select extract(epoch from deadline_at - now()) / 3600 as h from public.exam_attempts where id = $1", [attemptId]))[0].h;
    expect(Math.round(await hoursLeft())).toBe(2);
    await db.as(teacher, "update public.exams set ends_at = now() + interval '5 hours' where id = $1", [exam.examId]);
    expect(Math.round(await hoursLeft())).toBe(5);
    await db.sql("update public.exam_attempts set started_at = now() - interval '10 minutes' where id = $1", [attemptId]);
    await db.as(teacher, "update public.exams set ends_at = now() - interval '1 minute' where id = $1", [exam.examId]);
    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1)).status).toBe("deadline_passed");
  });

  it("refuses to reopen a window that has already ended", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    await db.sql("update public.exams set ends_at = now() - interval '1 minute' where id = $1", [exam.examId]);
    await expect(
      db.as(teacher, "update public.exams set ends_at = now() + interval '1 hour' where id = $1", [exam.examId]),
    ).rejects.toThrow(/EXAM_WINDOW_ENDED/);
  });

  it("hides results for every release mode", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { release: "immediate", mcq: [{ marks: 1 }] });
    const attemptId = await start(alice, exam.examId);
    await submit(alice, attemptId);
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(1);
    await db.as(teacher, "select public.unpublish_results($1)", [exam.examId]);
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
    await db.as(teacher, "select public.publish_results($1)", [exam.examId]);
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(1);
  });

  it("duplicates with whole-minute times so the copy stays editable after it starts", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const [{ duplicate_exam: copyId }] = await db.as<{ duplicate_exam: string }>(teacher, "select public.duplicate_exam($1)", [exam.examId]);
    const [c] = await db.sql<{ s: number; e: number }>(
      "select extract(second from starts_at) as s, extract(second from ends_at) as e from public.exams where id = $1",
      [copyId],
    );
    expect(Number(c.s)).toBe(0);
    expect(Number(c.e)).toBe(0);
  });

  it("refuses to reopen grading on an attempt that isn't submitted", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const attemptId = await start(bob, exam.examId);
    await expect(db.as(teacher, "select public.reopen_grading($1)", [attemptId])).rejects.toThrow(/ATTEMPT_NOT_SUBMITTED/);
    expect(await db.sql("select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
  });

  it("closes a scheduled exam that hasn't opened yet", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    // Fixture only: move it into the future without the settings guard.
    await db.sql(
      `begin; set local session_replication_role = replica;
       update public.exams set starts_at = now() + interval '1 day', ends_at = now() + interval '2 days' where id = '${exam.examId}';
       commit;`,
    );
    await db.as(teacher, "select public.close_exam($1)", [exam.examId]);
    const [e] = await db.sql<{ status: string }>("select status from public.exams where id = $1", [exam.examId]);
    expect(e.status).toBe("closed");
    await expect(start(alice, exam.examId)).rejects.toThrow(/EXAM_NOT_AVAILABLE/);
  });

  it("keeps the timeout finalization when starting again is refused (attempt limit)", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { maxAttempts: 1, mcq: [{ marks: 1 }] });
    const attemptId = await start(alice, exam.examId);
    await expireAttempt(db, attemptId);
    // Returns the finalized attempt (the app opens its result) instead of rolling the timeout back.
    expect(await start(alice, exam.examId)).toBe(attemptId);
    const [a] = await db.sql<{ status: string; submitted_via: string }>("select status, submitted_via from public.exam_attempts where id = $1", [attemptId]);
    expect(a).toEqual({ status: "submitted", submitted_via: "timeout" });
    await expect(start(alice, exam.examId)).rejects.toThrow(/ATTEMPT_LIMIT_REACHED/);
  });
});

type Overview = { submitted: number; counted: number; average: string | number | null; passRate: string | number | null; exams: unknown[]; students: { attempts: number }[] };

describe("which attempt counts, and the results overview", () => {
  async function twoAttempts(policy: "best" | "latest") {
    const exam = await seedPublishedExam(db, teacher, courseId, { maxAttempts: 2, passMarks: 2, mcq: [{ marks: 2 }, { marks: 2 }] });
    await db.as(teacher, "update public.exams set result_policy = $2 where id = $1", [exam.examId, policy]);
    const first = await start(alice, exam.examId); // 4/4
    await save(alice, first, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await save(alice, first, exam.mcq[1].id, exam.mcq[1].correct, 1);
    await db.as(alice, "select public.submit_attempt($1)", [first]);
    const second = await start(alice, exam.examId); // 2/4
    await save(alice, second, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await db.as(alice, "select public.submit_attempt($1)", [second]);
    return { exam, first, second };
  }
  const counted = (uid: Uid, examId: string) =>
    db.as<{ attempt_id: string }>(uid, "select attempt_id from public.counted_attempts where exam_id = $1", [examId]);

  it("counts the best attempt by default and the latest when chosen", async () => {
    const best = await twoAttempts("best");
    expect((await counted(teacher, best.exam.examId)).map((r) => r.attempt_id)).toEqual([best.first]);
    const latest = await twoAttempts("latest");
    expect((await counted(teacher, latest.exam.examId)).map((r) => r.attempt_id)).toEqual([latest.second]);
  });

  it("shows students only their own counted attempt", async () => {
    const { exam, first } = await twoAttempts("best");
    expect((await counted(alice, exam.examId)).map((r) => r.attempt_id)).toEqual([first]);
    expect(await counted(bob, exam.examId)).toHaveLength(0);
  });

  it("computes the overview over counted attempts only, and only for teachers", async () => {
    const { exam } = await twoAttempts("best");
    const [{ results_overview: o }] = await db.as<{ results_overview: Overview }>(teacher, "select public.results_overview(null, $1, null, null)", [exam.examId]);
    expect(o.submitted).toBe(2);
    expect(o.counted).toBe(1);
    expect(Number(o.average)).toBe(100);
    expect(Number(o.passRate)).toBe(100);
    expect(o.exams).toHaveLength(1);
    expect(o.students[0]).toMatchObject({ attempts: 1 });
    await db.as(teacher, "update public.exams set result_policy = 'latest' where id = $1", [exam.examId]);
    const [{ results_overview: o2 }] = await db.as<{ results_overview: Overview }>(teacher, "select public.results_overview(null, $1, null, null)", [exam.examId]);
    expect(Number(o2.average)).toBe(50);
    await expect(db.as(alice, "select public.results_overview()")).rejects.toThrow(/FORBIDDEN/);
  });

  it("filters the overview by submission time", async () => {
    const { exam } = await twoAttempts("best");
    const [{ results_overview: o }] = await db.as<{ results_overview: Overview }>(
      teacher, "select public.results_overview(null, $1, now() + interval '1 day', null)", [exam.examId]);
    expect(o.submitted).toBe(0);
    expect(o.average).toBeNull();
  });

  it("keeps the policy when duplicating", async () => {
    const { exam } = await twoAttempts("latest");
    const [{ duplicate_exam: copy }] = await db.as<{ duplicate_exam: string }>(teacher, "select public.duplicate_exam($1)", [exam.examId]);
    const [c] = await db.sql<{ p: string }>("select result_policy::text as p from public.exams where id = $1", [copy]);
    expect(c.p).toBe("latest");
  });
});

describe("email notification claims", () => {
  type Ann = { student_id: string; email: string };
  type Res = { student_id: string; attempt_id: string; total_score: string };

  it("announces a published exam once to each active student, teacher only", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const first = await db.as<Ann>(teacher, "select * from public.claim_exam_announcements($1)", [exam.examId]);
    expect(first.map((r) => r.student_id).sort()).toEqual([alice, bob].sort());
    expect(await db.as(teacher, "select * from public.claim_exam_announcements($1)", [exam.examId])).toHaveLength(0);
    await expect(db.as(alice, "select * from public.claim_exam_announcements($1)", [exam.examId])).rejects.toThrow(/FORBIDDEN/);
  });

  it("claims a result only once it is visible, once per student, and can be released for a retry", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { release: "manual", mcq: [{ marks: 2 }] });
    const attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
    // Graded but not published (manual): nothing to send yet.
    expect(await db.as(teacher, "select * from public.claim_result_notifications($1)", [exam.examId])).toHaveLength(0);
    await db.as(teacher, "select public.publish_results($1)", [exam.examId]);
    const sent = await db.as<Res>(teacher, "select * from public.claim_result_notifications($1)", [exam.examId]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ student_id: alice, attempt_id: attemptId });
    expect(Number(sent[0].total_score)).toBe(2);
    expect(await db.as(teacher, "select * from public.claim_result_notifications($1)", [exam.examId])).toHaveLength(0);
    // Sending failed: release, and the next claim returns it again.
    await db.as(teacher, "select public.release_notifications('result_released', $1, $2)", [exam.examId, [alice]]);
    expect(await db.as(teacher, "select * from public.claim_result_notifications($1)", [exam.examId])).toHaveLength(1);
  });

  it("lets a student claim only their own result (immediate release)", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { release: "immediate", mcq: [{ marks: 1 }] });
    const a = await start(alice, exam.examId);
    await db.as(alice, "select public.submit_attempt($1)", [a]);
    const b = await start(bob, exam.examId);
    await db.as(bob, "select public.submit_attempt($1)", [b]);
    const mine = await db.as<Res>(alice, "select * from public.claim_result_notifications($1)", [exam.examId]);
    expect(mine.map((r) => r.student_id)).toEqual([alice]);
    await expect(db.as(alice, "select public.release_notifications('result_released', $1, $2)", [exam.examId, [bob]])).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("extra time for individual students", () => {
  const status = async (id: string) =>
    (await db.sql<{ status: string; extended: boolean }>("select status::text, extended_at is not null as extended from public.exam_attempts where id = $1", [id]))[0];

  it("reopens a submitted attempt with extra minutes; answers can change and are regraded", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 2 }] });
    const attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].wrong, 1);
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
    // Time is over: the student can't change anything on their own.
    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 2)).status).toBe("finalized");

    await expect(db.as(alice, "select public.reopen_attempt($1, 15, null)", [attemptId])).rejects.toThrow(/FORBIDDEN/);
    await db.as(teacher, "select public.reopen_attempt($1, 15, 'Power cut during the exam')", [attemptId]);
    expect(await status(attemptId)).toEqual({ status: "in_progress", extended: true });
    // Hidden from the student while reopened.
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);

    expect((await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 3)).status).toBe("saved");
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);
    const [r] = await db.sql<{ mcq: string }>("select mcq_score as mcq from public.attempt_results where attempt_id = $1", [attemptId]);
    expect(Number(r.mcq)).toBe(2);
    await expect(db.as(teacher, "select public.reopen_attempt($1, 0, null)", [attemptId])).rejects.toThrow(/INVALID_EXTENSION/);
  });

  it("keeps answer keys hidden from everyone while an extension is open", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { release: "after_close", mcq: [{ marks: 1 }] });
    const a = await start(alice, exam.examId);
    await db.as(alice, "select public.submit_attempt($1)", [a]);
    const b = await start(bob, exam.examId);
    await db.as(bob, "select public.submit_attempt($1)", [b]);
    await db.as(teacher, "select public.close_exam($1)", [exam.examId]);
    expect(await db.as(alice, "select * from public.get_released_answer_keys($1)", [a])).toHaveLength(1);
    await db.as(teacher, "select public.reopen_attempt($1, 30, null)", [b]);
    expect(await db.as(alice, "select * from public.get_released_answer_keys($1)", [a])).toHaveLength(0);
  });

  it("lets a student who missed the exam start one attempt in a personal late window", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { durationMinutes: 30, mcq: [{ marks: 1 }] });
    await db.sql("update public.exams set ends_at = now() - interval '1 minute' where id = $1", [exam.examId]);
    await expect(start(bob, exam.examId)).rejects.toThrow(/EXAM_ENDED/);
    // Students can't grant themselves time; the window must be valid and the student enrolled.
    await expect(db.as(bob, "select public.grant_late_start($1, $2, now(), now() + interval '1 day', null)", [exam.examId, bob])).rejects.toThrow(/FORBIDDEN/);
    await expect(db.as(teacher, "select public.grant_late_start($1, $2, now(), now() - interval '1 hour', null)", [exam.examId, bob])).rejects.toThrow(/INVALID_DEADLINE/);
    await expect(db.as(teacher, "select public.grant_late_start($1, $2, now(), now() + interval '1 day', null)", [exam.examId, outsider])).rejects.toThrow(/STUDENT_NOT_FOUND/);

    await db.as(teacher, "select public.grant_late_start($1, $2, now() - interval '1 minute', now() + interval '2 hours', 'Was ill')", [exam.examId, bob]);
    expect(await db.as(bob, "select * from public.my_late_window($1)", [exam.examId])).toHaveLength(1);
    expect(await db.as(alice, "select * from public.my_late_window($1)", [exam.examId])).toHaveLength(0);
    const attemptId = await start(bob, exam.examId);
    const [x] = await db.sql<{ mins: number; extended: boolean }>(
      "select extract(epoch from deadline_at - started_at) / 60 as mins, extended_at is not null as extended from public.exam_attempts where id = $1",
      [attemptId],
    );
    expect(Math.round(x.mins)).toBe(30);
    expect(x.extended).toBe(true);
    await db.as(bob, "select public.submit_attempt($1)", [attemptId]);
    // Used once.
    expect(await db.as(bob, "select * from public.my_late_window($1)", [exam.examId])).toHaveLength(0);
    await expect(start(bob, exam.examId)).rejects.toThrow(/EXAM_ENDED/);
  });

  it("doesn't open a late window before its start, and a revoked window can't be used", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    await db.as(teacher, "select public.close_exam($1)", [exam.examId]);
    await db.as(teacher, "select public.grant_late_start($1, $2, now() + interval '1 hour', now() + interval '3 hours', null)", [exam.examId, alice]);
    await expect(start(alice, exam.examId)).rejects.toThrow(/EXAM_NOT_AVAILABLE/);
    const [{ id }] = await db.sql<{ id: string }>("select id from public.exam_extensions where exam_id = $1 and student_id = $2", [exam.examId, alice]);
    await db.sql("update public.exam_extensions set starts_at = now() - interval '1 minute' where id = $1", [id]);
    await db.as(teacher, "select public.revoke_extension($1)", [id]);
    await expect(start(alice, exam.examId)).rejects.toThrow(/EXAM_NOT_AVAILABLE/);
  });

  it("doesn't cut granted extra time short when the exam's end time changes", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    const a = await start(alice, exam.examId);
    await db.as(alice, "select public.submit_attempt($1)", [a]);
    await db.as(teacher, "select public.reopen_attempt($1, 60, null)", [a]);
    await db.as(teacher, "update public.exams set ends_at = now() + interval '5 minutes' where id = $1", [exam.examId]);
    const [r] = await db.sql<{ mins: number }>("select extract(epoch from deadline_at - now()) / 60 as mins from public.exam_attempts where id = $1", [a]);
    expect(Math.round(r.mins)).toBe(60);
  });
});

describe("provisional MCQ score (mixed exams)", () => {
  type P = { mcq_score: string; mcq_max: string };
  const provisional = (uid: Uid, attemptId: string) => db.as<P>(uid, "select * from public.get_provisional_mcq($1)", [attemptId]);

  it("shows only the student's own MCQ total after submitting, while the written part waits", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { release: "immediate", mcq: [{ marks: 2, negative: 0.5 }, { marks: 2 }], cq: [{ marks: 6 }] });
    await db.as(teacher, "update public.exams set show_mcq_early = true where id = $1", [exam.examId]);
    const attemptId = await start(alice, exam.examId);
    await save(alice, attemptId, exam.mcq[0].id, exam.mcq[0].correct, 1);
    await save(alice, attemptId, exam.mcq[1].id, exam.mcq[1].wrong, 1);
    expect(await provisional(alice, attemptId)).toHaveLength(0); // not before submitting
    await db.as(alice, "select public.submit_attempt($1)", [attemptId]);

    const [p] = await provisional(alice, attemptId);
    expect({ score: Number(p.mcq_score), max: Number(p.mcq_max) }).toEqual({ score: 2, max: 4 });
    expect(await provisional(bob, attemptId)).toHaveLength(0);
    // The full result and per-question marks still wait for the written part.
    expect(await db.as(alice, "select * from public.attempt_results where attempt_id = $1", [attemptId])).toHaveLength(0);
    expect(await db.as(alice, "select * from public.grades where attempt_id = $1", [attemptId])).toHaveLength(0);
  });

  it("is off unless the teacher enables it, and only for mixed exams", async () => {
    const exam = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }], cq: [{ marks: 1 }] });
    const attemptId = await start(bob, exam.examId);
    await db.as(bob, "select public.submit_attempt($1)", [attemptId]);
    expect(await provisional(bob, attemptId)).toHaveLength(0);
    const mcqOnly = await seedPublishedExam(db, teacher, courseId, { mcq: [{ marks: 1 }] });
    await expect(db.as(teacher, "update public.exams set show_mcq_early = true where id = $1", [mcqOnly.examId])).rejects.toThrow(/exams_show_mcq_early_check/);
  });
});
