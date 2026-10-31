import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_COURSE_PREFIX, sql, type TestUser } from "./db";
import { STATE_FILE } from "./global-setup";

/**
 * Full teacher ↔ student journey against the linked Supabase project:
 * course → invitation → mixed exam → two students take it → grading → results,
 * plus access-control checks along the way. All data is removed in global teardown.
 */

const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { students: { alice: TestUser; bob: TestUser }; runId: string };
const { alice, bob } = state.students;
const teacher = { email: process.env.E2E_TEACHER_EMAIL!, password: process.env.E2E_TEACHER_PASSWORD! };

const COURSE = `${E2E_COURSE_PREFIX}Physics ${state.runId}`;
const EXAM = `${E2E_COURSE_PREFIX}Mixed test ${state.runId}`;
const MCQ_BODY = "What is the SI unit of force?";
const CQ_BODY = "Explain Newton's second law with an example.";

// A tiny valid PNG (1×1) used as a handwritten answer sheet.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let inviteCode = "";
const consoleErrors = new Set<string>();
let examId = "";

async function signIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.add(`${new URL(page.url()).pathname}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => consoleErrors.add(`${new URL(page.url()).pathname}: ${e.message.slice(0, 300)}`));
  await setEnglishCookie(context);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(teacher|student)(\/|$)/, { timeout: 60_000 });
  // Signing in applies the profile's language (Bangla by default); these tests read English text.
  await setEnglishCookie(page.context());
  await page.reload();
  return page;
}

/** The UI defaults to Bangla; the suite asserts on English text. */
async function setEnglishCookie(context: BrowserContext) {
  await context.addCookies([{ name: "lang", value: "en", url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
}

/** Datetime-local value in the teacher's own timezone, offset from now. */
function teacherLocalTime(offsetMinutes: number) {
  const [row] = sql<{ v: string }>(`
    select to_char((now() + interval '${offsetMinutes} minutes') at time zone p.timezone, 'YYYY-MM-DD"T"HH24:MI') as v
    from public.profiles p where p.email = '${teacher.email.replace(/'/g, "''")}'`);
  return row.v;
}

function attemptIdFor(studentId: string) {
  const [row] = sql<{ id: string }>(`select id from public.exam_attempts where exam_id = '${examId}' and student_id = '${studentId}' order by started_at desc limit 1`);
  return row.id;
}

async function confirm(page: Page, label: string) {
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await setEnglishCookie(context);
});

test.afterAll(() => {
  if (consoleErrors.size) console.log(`Browser console errors:\n${[...consoleErrors].join("\n")}`);
});

test("public pages and route protection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const path of ["/teacher", "/student", "/teacher/exams"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /teacher");
  expect((await page.request.get("/sitemap.xml")).status()).toBe(200);
});

test("auth screens validate input and never reveal accounts", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(alice.email);
  await page.locator("#password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.").first()).toBeVisible();

  await page.goto("/signup");
  await page.locator("#fullName").fill("Validation Only");
  await page.locator("#email").fill("not-an-email");
  await page.locator("#password").fill("abc");
  await expect(page.getByText("Password strength")).toBeVisible();
  await page.locator("#confirmPassword").fill("abcd");
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();
  await expect(page.getByText("Passwords don't match")).toBeVisible();

  // Unknown address: same response as a real one, and Supabase sends nothing.
  await page.goto("/forgot-password");
  await page.locator("#email").fill(`e2e-nobody-${state.runId}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Resend email in \d+s/ })).toBeDisabled();
});

test("teacher creates a course and an invitation code", async ({ browser }) => {
  const page = await signIn(browser, teacher.email, teacher.password);
  await expect(page).toHaveURL(/\/teacher/);
  await page.goto("/teacher/courses");
  await page.getByRole("button", { name: "New course" }).first().click();
  await page.locator("#course-title").fill(COURSE);
  await page.locator("#course-code").fill("E2E-PHY");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/teacher\/courses\/[0-9a-f-]{36}/, { timeout: 60_000 });

  await page.getByRole("tab", { name: /Invitations/ }).click();
  await page.getByRole("button", { name: "New invitation" }).click();
  await page.locator("#invite-label").fill("E2E batch");
  await page.locator("#invite-max").fill("5");
  await page.getByRole("dialog").getByRole("button", { name: "Generate code" }).click();
  const code = page.getByRole("dialog").locator("code");
  await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  inviteCode = (await code.textContent())!.trim();
  await page.getByRole("button", { name: "Done" }).click();

  // Only a hash is stored in the database.
  const [stored] = sql<{ n: number }>(`select count(*)::int as n from public.course_invites where code_hash is not null and label = 'E2E batch'`);
  expect(stored.n).toBeGreaterThan(0);
  await page.context().close();
});

test("students join with the code; a wrong code is rejected", async ({ browser }) => {
  for (const student of [alice, bob]) {
    const page = await signIn(browser, student.email, student.password);
    await page.goto("/student/join");
    if (student === alice) {
      await page.locator("#code").fill("ABCD-EFGH-JKMN");
      await page.getByRole("button", { name: "Join course" }).click();
      await expect(page.getByText(/code isn't valid/).first()).toBeVisible();
    }
    await page.locator("#code").fill(inviteCode.toLowerCase());
    await page.getByRole("button", { name: "Join course" }).click();
    await expect(page).toHaveURL(/\/student\/courses\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByText(COURSE).first()).toBeVisible();
    await page.context().close();
  }
});

test("teacher builds and publishes a mixed exam", async ({ browser }) => {
  const page = await signIn(browser, teacher.email, teacher.password);
  await page.goto("/teacher/exams/new");
  await page.locator("#title").fill(EXAM);
  await page.locator("#courseId").selectOption({ label: COURSE });
  await page.locator("#instructions").fill("Answer both questions. Upload a photo for the written answer.");
  await page.locator("#examType").selectOption("mixed");
  await page.locator("#totalMarks").fill("5");
  await page.locator("#passMarks").fill("2");
  await page.locator("#maxAttempts").fill("1");
  await page.locator("#startsAt").fill(teacherLocalTime(-5));
  await page.locator("#endsAt").fill(teacherLocalTime(180));
  await page.locator("#durationMinutes").fill("30");
  await page.locator("#resultsRelease").selectOption("manual");
  await page.locator("#revealAnswers").uncheck();
  await page.getByRole("button", { name: "Create exam and add questions" }).click();
  await expect(page).toHaveURL(/\/teacher\/exams\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  examId = page.url().split("/").pop()!;

  // MCQ: 2 marks, 0.5 negative, correct answer B.
  await page.getByRole("button", { name: "Add question" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("#q-marks").fill("2");
  await dialog.locator("#q-negative").fill("0.5");
  await dialog.locator("#q-body").fill(MCQ_BODY);
  for (const [i, text] of ["Joule", "Newton", "Watt", "Pascal"].entries()) {
    await dialog.getByLabel(`Option ${String.fromCharCode(65 + i)}`, { exact: true }).fill(text);
  }
  await dialog.getByLabel("Mark option B as correct").check();
  await dialog.getByRole("button", { name: "Add question" }).click();
  await expect(dialog).toBeHidden();

  // Written question: 3 marks. Wait for the list to refresh with the first question.
  await expect(page.getByRole("tab", { name: "Questions (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Add question" }).first().click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#q-type").selectOption("cq");
  await dialog.locator("#q-marks").fill("3");
  await dialog.locator("#q-body").fill(CQ_BODY);
  await dialog.locator("#q-rubric").fill("1 for the law, 1 for the formula, 1 for the example");
  await dialog.getByRole("button", { name: "Add question" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("5 / 5")).toBeVisible();

  // Answer keys live in the teacher-only table.
  const [keys] = sql<{ n: number }>(`select count(*)::int as n from public.question_answer_keys k join public.questions q on q.id = k.question_id where q.exam_id = '${examId}' and k.correct_option_id is not null`);
  expect(keys.n).toBe(1);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page, "Publish");
  await expect(page.getByRole("button", { name: "Close exam" }).or(page.getByText("Published").first())).toBeVisible();
  const [exam] = sql<{ status: string }>(`select status from public.exams where id = '${examId}'`);
  expect(exam.status).toBe("published");
  await page.context().close();
});

async function takeExam(browser: Browser, student: TestUser, choice: string, uploadSheet: boolean) {
  const page = await signIn(browser, student.email, student.password);
  await page.goto("/student/exams");
  await page.getByRole("link", { name: EXAM }).first().click();
  await expect(page).toHaveURL(/\/student\/exams\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Start exam" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Begin now" }).click();
  await expect(page).toHaveURL(/\/student\/attempts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByRole("timer")).toBeVisible();

  // Question order is fixed (no shuffle): MCQ first.
  await expect(page.getByText(MCQ_BODY)).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^[A-D]\\. ${choice}$`) }).check();
  await expect(page.getByText("All answers saved")).toBeVisible();

  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByText(CQ_BODY)).toBeVisible();
  if (uploadSheet) {
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles({ name: "answer-page-1.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("link", { name: /Open page 1/ }).or(page.getByLabel(/Open page 1/))).toBeVisible({ timeout: 30_000 });
    // Upload a second page and remove it again.
    await input.setInputFiles({ name: "answer-page-2.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByLabel(/Open page 2/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(/Remove answer-page-2/).click();
    await expect(page.getByLabel(/Open page 2/)).toBeHidden({ timeout: 30_000 });
  }

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Submit final answers" }).click();
  await expect(page).toHaveURL(/\/result$/, { timeout: 60_000 });
  await expect(page.getByText("Your answers were submitted")).toBeVisible();
  // Results are manual: no score is visible yet.
  await expect(page.getByText("Your score")).toBeHidden();
  return page;
}

test("Alice answers correctly and uploads her written answer", async ({ browser }) => {
  const page = await takeExam(browser, alice, "Newton", true);
  // A second attempt is not allowed (max attempts = 1).
  await page.goto(`/student/exams/${examId}`);
  await expect(page.getByRole("button", { name: "Start exam" })).toBeHidden();
  await page.context().close();
});

test("Bob answers wrongly (negative marking)", async ({ browser }) => {
  const page = await takeExam(browser, bob, "Joule", false);
  await page.context().close();
});

test("students can't reach teacher pages or each other's attempts", async ({ browser }) => {
  const page = await signIn(browser, bob.email, bob.password);
  await page.goto("/teacher");
  await expect(page).not.toHaveURL(/\/teacher/);
  await page.goto(`/student/attempts/${attemptIdFor(alice.id)}/result`);
  await expect(page.getByText("Your score")).toBeHidden();
  await expect(page.getByText(/not found|could not be found|doesn't exist|404/i).first()).toBeVisible();
  await page.context().close();
});

test("server graded the MCQs, including negative marking", () => {
  const rows = sql<{ email: string; mcq: number }>(`
    select p.email, r.mcq_score::float as mcq
    from public.attempt_results r
    join public.exam_attempts a on a.id = r.attempt_id
    join public.profiles p on p.id = a.student_id
    where a.exam_id = '${examId}'`);
  const byEmail = Object.fromEntries(rows.map((r) => [r.email, r.mcq]));
  expect(byEmail[alice.email]).toBe(2);
  expect(byEmail[bob.email]).toBe(-0.5);
});

test("teacher grades written answers and publishes results", async ({ browser }) => {
  const page = await signIn(browser, teacher.email, teacher.password);
  for (const [student, marks, feedback] of [
    [alice, "2.5", "Good example, formula slightly incomplete"],
    [bob, "1", "Only the law is stated"],
  ] as const) {
    await page.goto(`/teacher/attempts/${attemptIdFor(student.id)}`);
    const marksInput = page.getByLabel(/\(out of 3\)/);
    await marksInput.fill(marks);
    await page.getByLabel("Feedback for the student").fill(feedback);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Draft").or(page.getByText("Final")).first()).toBeVisible();
    await page.getByRole("button", { name: "Finalize grading" }).click();
    await confirm(page, "Finalize");
    await expect(page.getByRole("button", { name: "Reopen grading" })).toBeVisible();
  }

  await page.goto(`/teacher/exams/${examId}`);
  await page.getByRole("button", { name: "Publish results" }).click();
  await confirm(page, "Publish results");
  await expect(page.getByRole("button", { name: "Hide results" })).toBeVisible();
  await page.context().close();
});

test("students see their released results", async ({ browser }) => {
  for (const [student, total, pct, outcome] of [
    [alice, "4.5", "90%", "Passed"],
    [bob, "0.5", "10%", "Not passed"] // −0.5 MCQ + 1 written,
  ] as const) {
    const page = await signIn(browser, student.email, student.password);
    await page.goto(`/student/attempts/${attemptIdFor(student.id)}/result`);
    await expect(page.getByText("Your score")).toBeVisible();
    await expect(page.getByText(`${total}`, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(pct, { exact: true })).toBeVisible();
    await expect(page.getByText(outcome, { exact: true })).toBeVisible();
    await page.context().close();
  }
});

test("sign out works from the user menu", async ({ browser }) => {
  const page = await signIn(browser, alice.email, alice.password);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login/);
  await page.context().close();
});
