/** Public site metadata shared by the root layout, sitemap, robots and social images. */
export const SITE_NAME = "ExamDesk";
export const SITE_DESCRIPTION =
  "ExamDesk is an online exam management system for teachers and students: courses with invite codes, timed MCQ and written exams with autosave, automatic grading, handwritten answer review, results and analytics.";
export const SITE_URL = (
  process.env.NEXT_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
export const BRAND_FROM = "#4f46e5";
export const BRAND_TO = "#b84fd0";
