"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireStudent } from "@/lib/auth/dal";
import { dbFail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { uuid } from "@/lib/validations/courses";
import { notifyReleasedResults } from "@/features/notifications/send";

export async function startAttemptAction(examId: string): Promise<ActionResult> {
  const id = uuid.safeParse(examId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireStudent();
  const { data, error } = await supabase.rpc("start_attempt", { p_exam_id: id.data });
  if (error) return dbFail(error, "startAttempt");
  redirect(`/student/attempts/${data}`);
}

/** Idempotent: submitting twice (double click, retry after a network error) is safe. */
export async function submitAttemptAction(attemptId: string): Promise<ActionResult<{ status: string }>> {
  const id = uuid.safeParse(attemptId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireStudent();
  const { data, error } = await supabase.rpc("submit_attempt", { p_attempt_id: id.data });
  if (error) return dbFail(error, "submitAttempt");
  // MCQ-only exams with immediate release have a result right away.
  if (data === "submitted") await notifyReleasedResults(supabase, null);
  refresh();
  return ok({ status: data }, data === "already_submitted" ? "This attempt was already submitted." : "Your answers have been submitted.");
}
