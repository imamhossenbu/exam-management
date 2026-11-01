"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { zonedInputToUtc } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";
import { notifyReleasedResults } from "@/features/notifications/send";

const gradeSchema = z.object({
  attemptId: uuid,
  questionId: uuid,
  partId: z.union([uuid, z.null()]),
  marks: z.coerce.number({ message: "Enter marks" }).min(0, { message: "Marks can't be negative" }).max(1000).multipleOf(0.25, { message: "Use steps of 0.25" }),
  feedback: z.string().trim().max(5000).default(""),
});

export async function saveGradeAction(input: unknown): Promise<ActionResult> {
  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc("save_cq_grade", {
    p_attempt_id: parsed.data.attemptId,
    p_question_id: parsed.data.questionId,
    p_part_id: parsed.data.partId,
    p_marks: parsed.data.marks,
    p_feedback: parsed.data.feedback || null,
  });
  if (error) return dbFail(error, "saveGrade");
  refresh();
  return ok(undefined, "Draft mark saved");
}

const ATTEMPT_OPS = {
  finalize: { rpc: "finalize_grading", message: "Grading finalized" },
  reopen: { rpc: "reopen_grading", message: "Grading reopened. Marks are drafts again." },
} as const;

export async function attemptGradingAction(attemptId: string, op: keyof typeof ATTEMPT_OPS): Promise<ActionResult> {
  const id = uuid.safeParse(attemptId);
  if (!id.success || !(op in ATTEMPT_OPS)) return fail("Invalid request.");
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc(ATTEMPT_OPS[op].rpc, { p_attempt_id: id.data });
  if (error) return dbFail(error, `grading.${op}`);
  if (op === "finalize") {
    const { data: attempt } = await supabase.from("exam_attempts").select("exam_id").eq("id", id.data).maybeSingle();
    if (attempt) await notifyReleasedResults(supabase, attempt.exam_id);
  }
  refresh();
  return ok(undefined, ATTEMPT_OPS[op].message);
}

const returnSchema = z.object({
  attemptId: uuid,
  note: z.string().trim().max(2000).default(""),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "Choose a deadline" }),
});

export async function returnAttemptAction(input: unknown): Promise<ActionResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const deadline = zonedInputToUtc(parsed.data.deadline, profile.timezone);
  if (!deadline) return fail("Choose a valid deadline.");
  const { error } = await supabase.rpc("return_attempt", { p_attempt_id: parsed.data.attemptId, p_note: parsed.data.note || null, p_resubmit_deadline: deadline });
  if (error) return dbFail(error, "returnAttempt");
  refresh();
  return ok(undefined, "Returned to the student for correction");
}

const annotationSchema = z.object({
  attemptId: uuid,
  answerFileId: uuid,
  page: z.number().int().min(1).max(500).default(1),
  kind: z.enum(["tick", "cross", "highlight", "arrow", "comment"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  x2: z.number().min(0).max(1).nullable().default(null),
  y2: z.number().min(0).max(1).nullable().default(null),
  body: z.string().trim().max(1000).nullable().default(null),
});

export async function addAnnotationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = annotationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.kind === "comment" && !parsed.data.body) return fail("Write a comment first.");
  const { profile, supabase } = await requireTeacher();
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100000) / 100000);
  const { data, error } = await supabase
    .from("answer_annotations")
    .insert({
      attempt_id: parsed.data.attemptId,
      answer_file_id: parsed.data.answerFileId,
      page: parsed.data.page,
      kind: parsed.data.kind,
      x: round(parsed.data.x)!,
      y: round(parsed.data.y)!,
      x2: round(parsed.data.x2),
      y2: round(parsed.data.y2),
      body: parsed.data.body,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return dbFail(error, "addAnnotation");
  return ok({ id: data.id });
}

export async function deleteAnnotationAction(annotationId: string): Promise<ActionResult> {
  const id = uuid.safeParse(annotationId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("answer_annotations").delete().eq("id", id.data).select("id");
  if (error) return dbFail(error, "deleteAnnotation");
  if (!data.length) return fail("Annotation not found.");
  return ok(undefined);
}

const reopenSchema = z.object({
  attemptId: uuid,
  minutes: z.coerce.number().int().min(1, { message: "At least 1 minute" }).max(1440),
  note: z.string().trim().max(500).default(""),
});

/** Reopen a submitted attempt with extra minutes (power cut, accommodation…). */
export async function reopenAttemptAction(input: unknown): Promise<ActionResult> {
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc("reopen_attempt", { p_attempt_id: parsed.data.attemptId, p_minutes: parsed.data.minutes, p_note: parsed.data.note || null });
  if (error) return dbFail(error, "reopenAttempt");
  refresh();
  return ok(undefined, "Attempt reopened with extra time");
}

const lateSchema = z.object({
  examId: uuid,
  studentId: uuid,
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "Choose a start date and time" }),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "Choose an end date and time" }),
  note: z.string().trim().max(500).default(""),
});

/** Let one student start an attempt in a personal window (after the exam ended, attempts used up…). */
export async function grantLateStartAction(input: unknown): Promise<ActionResult> {
  const parsed = lateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const startsAt = zonedInputToUtc(parsed.data.startsAt, profile.timezone);
  const endsAt = zonedInputToUtc(parsed.data.endsAt, profile.timezone);
  if (!startsAt || !endsAt) return fail("Invalid start or end time.");
  if (endsAt <= startsAt) return fail("The window must end after it starts", { endsAt: ["The window must end after it starts"] });
  const { error } = await supabase.rpc("grant_late_start", {
    p_exam_id: parsed.data.examId,
    p_student_id: parsed.data.studentId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_note: parsed.data.note || null,
  });
  if (error) return dbFail(error, "grantLateStart");
  refresh();
  return ok(undefined, "Late attempt allowed");
}

export async function revokeExtensionAction(extensionId: string): Promise<ActionResult> {
  const id = uuid.safeParse(extensionId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc("revoke_extension", { p_extension_id: id.data });
  if (error) return dbFail(error, "revokeExtension");
  refresh();
  return ok(undefined, "Late attempt permission revoked");
}
