import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const ROOT = path.resolve(__dirname, "../../..");

export type Uid = string;

/** Thin wrapper over a dedicated test database with helpers to act as a user. */
export class TestDb {
  private constructor(
    readonly pool: pg.Pool,
    private readonly admin: pg.Pool,
    private readonly dbName: string,
  ) {}

  static async create(): Promise<TestDb> {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error("TEST_DATABASE_URL is not set. Run `npm run test:db`.");
    }
    const admin = new pg.Pool({ connectionString: url, max: 2 });
    const dbName = `exam_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await admin.query(`create database ${dbName}`);

    const target = new URL(url);
    target.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: target.toString(), max: 8 });

    const files = [
      path.join(ROOT, "supabase/tests/harness/supabase_stubs.sql"),
      ...readdirSync(path.join(ROOT, "supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => path.join(ROOT, "supabase/migrations", f)),
    ];
    for (const file of files) {
      await pool.query(readFileSync(file, "utf8"));
    }
    return new TestDb(pool, admin, dbName);
  }

  async destroy() {
    await this.pool.end();
    await this.admin.query(`drop database if exists ${this.dbName} with (force)`);
    await this.admin.end();
  }

  /** Run SQL as the superuser (bypasses RLS) — for fixtures only. */
  async sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
    return (await this.pool.query<T>(text, params)).rows;
  }

  /** Run SQL as an authenticated user, inside a transaction, with RLS applied. */
  async as<T extends pg.QueryResultRow = pg.QueryResultRow>(
    uid: Uid | null,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${uid ? "authenticated" : "anon"}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" }),
      ]);
      const res = await client.query<T>(text, params);
      await client.query("commit");
      return res.rows;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createUser(email: string, meta: Record<string, unknown> = {}): Promise<Uid> {
    const [row] = await this.sql<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify(meta)],
    );
    return row.id;
  }

  async createTeacher(email = "teacher@example.com"): Promise<Uid> {
    const id = await this.createUser(email, { full_name: "Teacher" });
    await this.sql("select app_private.promote_to_teacher($1)", [email]);
    return id;
  }
}

export function hashInvite(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Builds a published exam with the given questions. Returns ids. */
export async function seedPublishedExam(
  db: TestDb,
  teacher: Uid,
  courseId: string,
  opts: {
    type?: "mcq" | "cq" | "mixed";
    release?: "immediate" | "after_close" | "manual";
    maxAttempts?: number;
    durationMinutes?: number;
    mcqDurationMinutes?: number | null;
    shuffleQuestions?: boolean;
    passMarks?: number | null;
    mcq?: { marks: number; negative?: number }[];
    cq?: { marks: number; parts?: number[] }[];
  } = {},
) {
  const mcq = opts.mcq ?? [{ marks: 2, negative: 0.5 }, { marks: 2, negative: 0.5 }];
  const cq = opts.cq ?? [];
  const total = [...mcq.map((q) => q.marks), ...cq.map((q) => q.marks)].reduce((a, b) => a + b, 0);
  const type = opts.type ?? (cq.length && mcq.length ? "mixed" : cq.length ? "cq" : "mcq");

  const [exam] = await db.as<{ id: string }>(
    teacher,
    `insert into public.exams (course_id, title, exam_type, total_marks, pass_marks, duration_minutes,
       starts_at, ends_at, max_attempts, results_release, mcq_duration_minutes, shuffle_questions)
     values ($1, 'Test exam', $2, $3, $4, $5, now() - interval '1 hour', now() + interval '2 hours', $6, $7, $8, $9)
     returning id`,
    [
      courseId, type, total, opts.passMarks ?? null, opts.durationMinutes ?? 30, opts.maxAttempts ?? 1, opts.release ?? "immediate",
      opts.mcqDurationMinutes ?? null, opts.shuffleQuestions ?? false,
    ],
  );

  const mcqIds: { id: string; correct: string; wrong: string }[] = [];
  let position = 0;
  for (const q of mcq) {
    const [question] = await db.as<{ id: string }>(
      teacher,
      `insert into public.questions (exam_id, type, position, body, marks, negative_marks)
       values ($1, 'mcq', $2, 'What is 2 + 2?', $3, $4) returning id`,
      [exam.id, position++, q.marks, q.negative ?? 0],
    );
    const opts2 = await db.as<{ id: string }>(
      teacher,
      `insert into public.question_options (question_id, body, position)
       values ($1, '4', 0), ($1, '5', 1), ($1, '6', 2) returning id`,
      [question.id],
    );
    await db.as(
      teacher,
      `insert into public.question_answer_keys (question_id, correct_option_id, explanation) values ($1, $2, 'Because arithmetic.')`,
      [question.id, opts2[0].id],
    );
    mcqIds.push({ id: question.id, correct: opts2[0].id, wrong: opts2[1].id });
  }

  const cqIds: { id: string; parts: string[] }[] = [];
  for (const q of cq) {
    const [question] = await db.as<{ id: string }>(
      teacher,
      `insert into public.questions (exam_id, type, position, body, marks) values ($1, 'cq', $2, 'Explain photosynthesis.', $3) returning id`,
      [exam.id, position++, q.marks],
    );
    const parts: string[] = [];
    for (const [i, marks] of (q.parts ?? []).entries()) {
      const [part] = await db.as<{ id: string }>(
        teacher,
        `insert into public.question_parts (question_id, label, body, marks, position) values ($1, $2, 'Part', $3, $4) returning id`,
        [question.id, String.fromCharCode(97 + i), marks, i],
      );
      parts.push(part.id);
    }
    await db.as(
      teacher,
      `insert into public.question_answer_keys (question_id, model_answer, rubric) values ($1, 'Secret model answer', 'Secret rubric')`,
      [question.id],
    );
    cqIds.push({ id: question.id, parts });
  }

  await db.as(teacher, "select public.publish_exam($1)", [exam.id]);
  return { examId: exam.id, mcq: mcqIds, cq: cqIds, total };
}

/** Forces an attempt past its deadline (fixture helper, superuser only). */
export async function expireAttempt(db: TestDb, attemptId: string) {
  await db.sql(
    `update public.exam_attempts
     set started_at = now() - interval '2 hours', deadline_at = now() - interval '1 minute'
     where id = $1`,
    [attemptId],
  );
}
