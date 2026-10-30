import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function record(name, status, details = "") {
  if (status === "PASS") {
    results.passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    results.failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name} - ${details}`);
  }
  results.tests.push({ name, status, details });
}

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`Starting End-to-End & API Test Suite on ${BASE_URL}`);
  console.log(`======================================================\n`);

  // -----------------------------------------------------------------
  // 1. API & Static Asset Tests
  // -----------------------------------------------------------------
  console.log(`\x1b[1m[1/4] Testing API Routes & SEO Assets...\x1b[0m`);

  try {
    const res = await fetch(`${BASE_URL}/robots.txt`);
    const text = await res.text();
    if (res.status === 200 && text.includes("Disallow: /teacher") && text.includes("sitemap.xml")) {
      record("API: GET /robots.txt serves valid rules blocking private routes", "PASS");
    } else {
      record("API: GET /robots.txt", "FAIL", `status ${res.status}`);
    }
  } catch (err) {
    record("API: GET /robots.txt", "FAIL", err.message);
  }

  try {
    const res = await fetch(`${BASE_URL}/sitemap.xml`);
    const text = await res.text();
    if (res.status === 200 && text.includes("<urlset") && text.includes(BASE_URL)) {
      record("API: GET /sitemap.xml serves valid XML sitemap", "PASS");
    } else {
      record("API: GET /sitemap.xml", "FAIL", `status ${res.status}`);
    }
  } catch (err) {
    record("API: GET /sitemap.xml", "FAIL", err.message);
  }

  try {
    const res = await fetch(`${BASE_URL}/manifest.webmanifest`);
    const json = await res.json();
    if (res.status === 200 && json.name && json.short_name === "ExamDesk") {
      record("API: GET /manifest.webmanifest serves valid PWA manifest", "PASS");
    } else {
      record("API: GET /manifest.webmanifest", "FAIL", `status ${res.status}`);
    }
  } catch (err) {
    record("API: GET /manifest.webmanifest", "FAIL", err.message);
  }

  try {
    const res = await fetch(`${BASE_URL}/icon.svg`);
    const type = res.headers.get("content-type");
    if (res.status === 200 && type?.includes("image/svg")) {
      record("API: GET /icon.svg serves application icon", "PASS");
    } else {
      record("API: GET /icon.svg", "FAIL", `status ${res.status}, type: ${type}`);
    }
  } catch (err) {
    record("API: GET /icon.svg", "FAIL", err.message);
  }

  try {
    const res = await fetch(`${BASE_URL}/opengraph-image`);
    const type = res.headers.get("content-type");
    if (res.status === 200 && type?.includes("image/png")) {
      record("API: GET /opengraph-image serves dynamic social preview card", "PASS");
    } else {
      record("API: GET /opengraph-image", "FAIL", `status ${res.status}, type: ${type}`);
    }
  } catch (err) {
    record("API: GET /opengraph-image", "FAIL", err.message);
  }

  try {
    // Unauthenticated GET /api/results should be protected
    const res = await fetch(`${BASE_URL}/api/results`, { redirect: "manual" });
    if (res.status === 307 && res.headers.get("location")?.includes("/login?next=%2Fapi%2Fresults")) {
      record("API: GET /api/results protects CSV export and redirects unauthenticated requests to login", "PASS");
    } else {
      record("API: GET /api/results", "FAIL", `status ${res.status}, location: ${res.headers.get("location")}`);
    }
  } catch (err) {
    record("API: GET /api/results", "FAIL", err.message);
  }

  try {
    // Invalid /auth/confirm parameters should redirect to /auth/error
    const res = await fetch(`${BASE_URL}/auth/confirm?token_hash=fake&type=signup`, { redirect: "manual" });
    if (res.status === 307 && res.headers.get("location")?.includes("/auth/error")) {
      record("API: GET /auth/confirm with invalid token redirects to /auth/error", "PASS");
    } else {
      record("API: GET /auth/confirm", "FAIL", `status ${res.status}, location: ${res.headers.get("location")}`);
    }
  } catch (err) {
    record("API: GET /auth/confirm", "FAIL", err.message);
  }

  // -----------------------------------------------------------------
  // 2. Playwright Browser E2E Tests: Public Pages & Route Protection
  // -----------------------------------------------------------------
  console.log(`\n\x1b[1m[2/4] Testing Route Protection & Public Pages (Playwright)...\x1b[0m`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`${BASE_URL}/`);
    const title = await page.title();
    const h1 = await page.locator("h1").innerText();
    const signInBtn = page.getByRole("link", { name: "Sign in" }).first();
    const createAccBtn = page.getByRole("link", { name: "Create account" }).first();

    if (
      title.includes("ExamDesk") &&
      h1.includes("Exams, grading and notes") &&
      (await signInBtn.isVisible()) &&
      (await createAccBtn.isVisible())
    ) {
      record("E2E: Homepage renders title, hero headline, and call-to-actions", "PASS");
    } else {
      record("E2E: Homepage", "FAIL", `title: ${title}, h1: ${h1}`);
    }
  } catch (err) {
    record("E2E: Homepage", "FAIL", err.message);
  }

  // Route protection tests
  const protectedRoutes = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/teacher", name: "Teacher Home" },
    { path: "/teacher/exams", name: "Teacher Exams" },
    { path: "/teacher/courses", name: "Teacher Courses" },
    { path: "/teacher/grading", name: "Teacher Grading" },
    { path: "/teacher/results", name: "Teacher Results" },
    { path: "/student", name: "Student Home" },
    { path: "/student/exams", name: "Student Exams" },
    { path: "/student/notes", name: "Student Notes" },
    { path: "/student/join", name: "Student Join Course" },
  ];

  for (const { path, name } of protectedRoutes) {
    try {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForURL(/\/login/);
      const url = page.url();
      if (url.includes(`/login?next=${encodeURIComponent(path)}`)) {
        record(`E2E Security: Unauthenticated access to ${name} (${path}) redirects to login with return path`, "PASS");
      } else {
        record(`E2E Security: ${name}`, "FAIL", `redirected to: ${url}`);
      }
    } catch (err) {
      record(`E2E Security: ${name}`, "FAIL", err.message);
    }
  }

  // -----------------------------------------------------------------
  // 3. Playwright Browser E2E Tests: Auth Forms & Client Validations
  // -----------------------------------------------------------------
  console.log(`\n\x1b[1m[3/4] Testing Auth Screens & Form Validations (Playwright)...\x1b[0m`);

  // Login failure validation
  try {
    await page.goto(`${BASE_URL}/login`);
    await page.locator("#email").fill("test-student@example.com");
    await page.locator("#password").fill("wrong-password-12345");
    await page.getByRole("button", { name: "Sign in" }).click();

    const errorMsg = page.getByText("Incorrect email or password.").first();
    await errorMsg.waitFor({ state: "visible", timeout: 10000 });
    record("E2E Auth: Login shows 'Incorrect email or password' on invalid credentials", "PASS");
  } catch (err) {
    record("E2E Auth: Login validation", "FAIL", err.message);
  }

  // Signup form validations
  try {
    await page.goto(`${BASE_URL}/signup`);
    await page.locator("#fullName").fill("Test Candidate");
    await page.locator("#email").fill("invalid-email-format");
    await page.locator("#password").fill("weak");

    // Password strength indicator
    const strengthIndicator = page.getByText("Password strength");
    const isStrengthVisible = await strengthIndicator.isVisible();

    await page.locator("#confirmPassword").fill("different-weak");
    await page.getByRole("button", { name: "Create student account" }).click();

    const emailErr = await page.getByText("Enter a valid email address").first().isVisible();
    const passErr = await page.getByText("Use at least 8 characters").first().isVisible();
    const matchErr = await page.getByText("Passwords don't match").first().isVisible();

    if (emailErr && passErr && matchErr && isStrengthVisible) {
      record("E2E Auth: Signup validates email format, password length, password matching & shows strength meter", "PASS");
    } else {
      record("E2E Auth: Signup validation", "FAIL", `emailErr: ${emailErr}, passErr: ${passErr}, matchErr: ${matchErr}`);
    }
  } catch (err) {
    record("E2E Auth: Signup validation", "FAIL", err.message);
  }

  // Forgot password flow
  try {
    await page.goto(`${BASE_URL}/forgot-password`);
    await page.locator("#email").fill("unregistered-account@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();

    const checkEmailHeading = page.getByRole("heading", { name: "Check your email" });
    await checkEmailHeading.waitFor({ state: "visible", timeout: 10000 });
    const resendBtn = page.getByRole("button", { name: /Resend email in/ });
    const isResendDisabled = await resendBtn.isDisabled();

    if (isResendDisabled) {
      record("E2E Auth: Forgot password shows confirmation screen with rate-limiting resend cooldown", "PASS");
    } else {
      record("E2E Auth: Forgot password", "FAIL", "Resend button was not disabled with cooldown");
    }
  } catch (err) {
    record("E2E Auth: Forgot password", "FAIL", err.message);
  }

  // Setup page test
  try {
    await page.goto(`${BASE_URL}/setup`);
    const setupHeading = await page.locator("h1").innerText();
    if (setupHeading.toLowerCase().includes("configuration required")) {
      record("E2E Setup: Setup diagnostics page loads with 'Configuration required' guidance", "PASS");
    } else {
      record("E2E Setup", "FAIL", `heading: ${setupHeading}`);
    }
  } catch (err) {
    record("E2E Setup", "FAIL", err.message);
  }

  // Auth Error page test
  try {
    await page.goto(`${BASE_URL}/auth/error`);
    const errorHeading = await page.locator("h1").innerText();
    const signInBtn = page.getByRole("link", { name: "Sign in" });
    const resetBtn = page.getByRole("link", { name: "Send a new reset link" });
    if (
      errorHeading.includes("This link has expired") &&
      (await signInBtn.isVisible()) &&
      (await resetBtn.isVisible())
    ) {
      record("E2E Auth: /auth/error renders 'This link has expired' and action links", "PASS");
    } else {
      record("E2E Auth: /auth/error", "FAIL", `heading: ${errorHeading}`);
    }
  } catch (err) {
    record("E2E Auth: /auth/error", "FAIL", err.message);
  }

  await browser.close();

  // -----------------------------------------------------------------
  // 4. Supabase Backend API Direct Validation
  // -----------------------------------------------------------------
  console.log(`\n\x1b[1m[4/4] Testing Backend & Database Security Boundaries...\x1b[0m`);

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      "https://cazeweyqwlcmqyuwsrhq.supabase.co",
      "sb_publishable_vdWOuIRe1xtYCXlZcs4hcQ_ez_ZN-_y"
    );

    // Test anon block
    const { error: courseErr } = await supabase.from("courses").select("id");
    if (courseErr && courseErr.code === "42501") {
      record("Backend API: Postgres RLS blocks anonymous access to private tables (42501 Permission Denied)", "PASS");
    } else {
      record("Backend API: RLS anon check", "FAIL", `Expected 42501, got: ${JSON.stringify(courseErr)}`);
    }

    // Test auth service
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: "test-auth-probe@example.com",
      password: "TestProbePassword123!",
    });
    if (authErr && authErr.status === 400 && authErr.message.includes("Invalid login credentials")) {
      record("Backend API: Supabase Auth service is active and responding", "PASS");
    } else {
      record("Backend API: Supabase Auth check", "FAIL", JSON.stringify(authErr));
    }
  } catch (err) {
    record("Backend API: Supabase", "FAIL", err.message);
  }

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`TEST RESULTS SUMMARY`);
  console.log(`======================================================`);
  console.log(`Total tests:  ${results.passed + results.failed}`);
  console.log(`Passed:       \x1b[32m${results.passed}\x1b[0m`);
  console.log(`Failed:       \x1b[${results.failed > 0 ? "31" : "32"}m${results.failed}\x1b[0m`);
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log("Console errors logged during test:", consoleErrors);
  }
  console.log(`======================================================\n`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
