import "server-only";
import { after } from "next/server";
import type { ServerSupabase } from "@/lib/supabase/server";
import { sendExamAnnouncementEmail, sendResultPublishedEmail } from "@/lib/email/mailer";
import { getSiteUrl } from "@/lib/site-url";
import { formatDateTime } from "@/lib/utils/datetime";

/**
 * "New exam" and "your result is out" emails.
 *
 * Recipients are claimed in the database first (each person gets each email once), then the
 * emails go out after the response so the teacher's or student's action isn't slowed down.
 * Failed sends are released so a later trigger retries them. Without SMTP settings nothing
 * is claimed or sent.
 */
export function emailNotificationsEnabled(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

const CONCURRENCY = 4;

async function sendAll<T>(items: T[], send: (item: T) => Promise<unknown>): Promise<T[]> {
  const failed: T[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(send));
    results.forEach((r, j) => {
      if (r.status === "rejected") {
        failed.push(batch[j]);
        console.error("[notifications:send]", r.reason instanceof Error ? r.reason.message : r.reason);
      }
    });
  }
  return failed;
}

/** Frees claims whose email failed, so a later trigger retries. Best effort: never throws. */
function releaser(supabase: ServerSupabase) {
  return async (kind: "exam_published" | "result_released", examId: string, studentIds: string[]) => {
    try {
      const { error } = await supabase.rpc("release_notifications", { p_kind: kind, p_exam_id: examId, p_student_ids: studentIds });
      if (error) throw error;
    } catch (err) {
      console.error("[notifications:release]", err);
    }
  };
}

/** Tell every active student of the course about a newly published exam. */
export async function announceExam(supabase: ServerSupabase, examId: string): Promise<void> {
  if (!emailNotificationsEnabled()) return;
  try {
    const [{ data: recipients, error }, { data: exam }] = await Promise.all([
      supabase.rpc("claim_exam_announcements", { p_exam_id: examId }),
      supabase.from("exams").select("id, title, starts_at, duration_minutes, total_marks, course:courses(title)").eq("id", examId).maybeSingle(),
    ]);
    if (error) throw error;
    if (!recipients?.length || !exam) return;
    const site = await getSiteUrl();
    const release = releaser(supabase);
    after(async () => {
      const failed = await sendAll(recipients, (r) =>
        sendExamAnnouncementEmail({
          to: r.email,
          fullName: r.full_name || "Student",
          examTitle: exam.title,
          courseName: exam.course?.title ?? "",
          startsAt: formatDateTime(exam.starts_at, r.timezone, { withZone: true }),
          durationMinutes: exam.duration_minutes,
          totalMarks: Number(exam.total_marks),
          examUrl: `${site}/student/exams/${exam.id}`,
        }),
      );
      if (failed.length) await release("exam_published", examId, failed.map((f) => f.student_id));
    });
  } catch (err) {
    console.error("[notifications:announceExam]", err);
  }
}

/**
 * Email students whose result has just become visible. `examId` null covers all of the caller's
 * exams (the teacher's, or a student's own results).
 */
export async function notifyReleasedResults(supabase: ServerSupabase, examId: string | null): Promise<void> {
  if (!emailNotificationsEnabled()) return;
  try {
    const { data: recipients, error } = await supabase.rpc("claim_result_notifications", { p_exam_id: examId ?? undefined });
    if (error) throw error;
    if (!recipients?.length) return;
    const site = await getSiteUrl();
    const release = releaser(supabase);
    after(async () => {
      const failed = await sendAll(recipients, (r) =>
        sendResultPublishedEmail({
          to: r.email,
          fullName: r.full_name || "Student",
          examTitle: r.exam_title,
          courseName: r.course_title,
          score: Number(r.total_score),
          totalMarks: Number(r.max_score),
          percentage: Number(r.percentage),
          resultUrl: `${site}/student/attempts/${r.attempt_id}/result`,
        }),
      );
      const byExam = new Map<string, string[]>();
      for (const f of failed) byExam.set(f.exam_id, [...(byExam.get(f.exam_id) ?? []), f.student_id]);
      for (const [exam, students] of byExam) await release("result_released", exam, students);
    });
  } catch (err) {
    console.error("[notifications:notifyReleasedResults]", err);
  }
}
