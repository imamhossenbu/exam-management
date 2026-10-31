import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { type TestUser } from "./db";
import { STATE_FILE } from "./global-setup";

const SHOTS = "/private/tmp/claude-501/-Users-imam-exam-management/b1191152-0320-4bed-a34a-b50a037c45fe/scratchpad/shots";
const { alice } = (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { students: { alice: TestUser } }).students;
const teacher = { email: process.env.E2E_TEACHER_EMAIL!, password: process.env.E2E_TEACHER_PASSWORD! };
const ALLOW = /^(MCQ|MCQs|CQ|PDF|PDFs|OCR|CSV|ExamDesk|PNG|JPG|JPEG|WebP|MB|UTC|Esc|Asia|Dhaka|HSC|ICT|Alice|Test|Imam|Hossain|English|Next\.js|N|AT|IH|min|h|e2e|com|example|gmail|imam\d*|x|K7QM|XRP|TDA|ID|Supabase|OK)$/;
const report: Record<string, string[]> = {};

async function englishOn(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => document.body.innerText);
  const words = (text.match(/[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*)*/g) ?? [])
    .map((w) => w.trim())
    .filter((w) => w.split(/\s+/).some((x) => !ALLOW.test(x.replace(/[.’']+$/, ""))))
    .filter((w) => !/@|\.com/.test(w));
  report[name] = [...new Set(words)];
  await page.screenshot({ path: `${SHOTS}/bn-${name}.png`, fullPage: true });
}

async function signIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(teacher|student)/, { timeout: 60_000 });
  return page;
}

test.describe.configure({ mode: "serial" });
test.afterAll(() => writeFileSync(`${SHOTS}/bn-report.json`, JSON.stringify(report, null, 1)));

test("public pages", async ({ page }) => {
  for (const [p, n] of [["/", "home"], ["/login", "login"], ["/signup", "signup"], ["/forgot-password", "forgot"]] as const) {
    await page.goto(p);
    await englishOn(page, n);
  }
});

test("teacher pages", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await signIn(browser, teacher.email, teacher.password);
  for (const [p, n] of [
    ["/teacher", "t-dashboard"], ["/teacher/courses", "t-courses"], ["/teacher/students", "t-students"], ["/teacher/exams", "t-exams"],
    ["/teacher/exams/new", "t-exam-new"], ["/teacher/sources", "t-sources"], ["/teacher/grading", "t-grading"], ["/teacher/results", "t-results"], ["/teacher/settings", "t-settings"],
  ] as const) {
    await page.goto(p);
    await englishOn(page, n);
  }
  await page.goto("/teacher/courses");
  const course = page.locator('a[href^="/teacher/courses/"]').first();
  if (await course.count()) { await course.click(); await englishOn(page, "t-course-detail"); }
  await page.goto("/teacher/exams");
  const exam = page.locator('a[href^="/teacher/exams/"]:not([href$="/new"])').first();
  if (await exam.count()) { await exam.click(); await englishOn(page, "t-exam-detail"); }
});

test("student pages", async ({ browser }) => {
  const page = await signIn(browser, alice.email, alice.password);
  for (const [p, n] of [
    ["/student", "s-dashboard"], ["/student/courses", "s-courses"], ["/student/exams", "s-exams"], ["/student/results", "s-results"],
    ["/student/notes", "s-notes"], ["/student/resources", "s-resources"], ["/student/gallery", "s-gallery"], ["/student/join", "s-join"], ["/student/settings", "s-settings"],
  ] as const) {
    await page.goto(p);
    await englishOn(page, n);
  }
});
