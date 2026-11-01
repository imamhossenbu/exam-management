"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireTeacher } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { zonedInputToUtc } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";
import { effectiveMcqMinutes, examSettingsSchema, questionSchema, toQuestionPayload, type ExamSettingsOutput } from "@/lib/validations/exams";
import { z } from "zod";
import { announceExam, notifyReleasedResults } from "@/features/notifications/send";

function toExamRow(v: ExamSettingsOutput, timezone: string) {
  const starts = zonedInputToUtc(v.startsAt, timezone);
  const ends = zonedInputToUtc(v.endsAt, timezone);
  if (!starts || !ends) return null;
  return {
    subject_id: v.subjectId,
    title: v.title,
    description: v.description,
    instructions: v.instructions,
    exam_type: v.examType,
    total_marks: v.totalMarks,
    pass_marks: v.passMarks,
    duration_minutes: v.durationMinutes,
    mcq_duration_minutes: effectiveMcqMinutes(v),
    starts_at: starts,
    ends_at: ends,
    max_attempts: v.maxAttempts,
    shuffle_questions: v.shuffleQuestions,
    shuffle_options: v.shuffleOptions,
    results_release: v.resultsRelease,
    result_policy: v.resultPolicy,
    reveal_answers: v.revealAnswers,
    show_mcq_early: v.examType === "mixed" && v.showMcqEarly,
    allow_resubmission: v.allowResubmission,
  };
}

export async function createExamAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = examSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const row = toExamRow(parsed.data, profile.timezone);
  if (!row) return fail("Invalid start or end time.");
  const { data, error } = await supabase.from("exams").insert({ ...row, course_id: parsed.data.courseId }).select("id").single();
  if (error) return dbFail(error, "createExam");
  if (parsed.data.chapterIds.length) {
    const { error: chErr } = await supabase.rpc("set_exam_chapters", { p_exam_id: data.id, p_chapter_ids: parsed.data.chapterIds });
    if (chErr) return dbFail(chErr, "createExam.chapters");
  }
  redirect(`/teacher/exams/${data.id}`);
}

export async function updateExamAction(examId: string, input: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(examId);
  const parsed = examSettingsSchema.safeParse(input);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const row = toExamRow(parsed.data, profile.timezone);
  if (!row) return fail("Invalid start or end time.");
  const { data, error } = await supabase.from("exams").update(row).eq("id", id.data).select("id");
  if (error) return dbFail(error, "updateExam");
  if (!data.length) return fail("Exam not found.");
  const { error: chErr } = await supabase.rpc("set_exam_chapters", { p_exam_id: id.data, p_chapter_ids: parsed.data.chapterIds });
  if (chErr) return dbFail(chErr, "updateExam.chapters");
  refresh();
  return ok(undefined, "Exam settings saved");
}

export async function saveQuestionAction(examId: string, questionId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const id = uuid.safeParse(examId);
  const qid = questionId === null ? { success: true as const, data: null } : uuid.safeParse(questionId);
  const parsed = questionSchema.safeParse(input);
  if (!id.success) return invalid(id.error);
  if (!qid.success) return invalid(qid.error);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.rpc("save_question", {
    p_exam_id: id.data,
    p_question_id: qid.data,
    p_data: toQuestionPayload(parsed.data),
  });
  if (error) return dbFail(error, "saveQuestion");
  refresh();
  return ok({ id: data }, questionId ? "Question updated" : "Question added");
}

export async function deleteQuestionAction(questionId: string): Promise<ActionResult> {
  const id = uuid.safeParse(questionId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("questions").delete().eq("id", id.data).select("id");
  if (error) return dbFail(error, "deleteQuestion");
  if (!data.length) return fail("Question not found.");
  refresh();
  return ok(undefined, "Question deleted");
}

export async function duplicateQuestionAction(questionId: string): Promise<ActionResult> {
  const id = uuid.safeParse(questionId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc("duplicate_question", { p_question_id: id.data });
  if (error) return dbFail(error, "duplicateQuestion");
  refresh();
  return ok(undefined, "Question duplicated");
}

export async function reorderQuestionsAction(examId: string, questionIds: string[]): Promise<ActionResult> {
  const parsed = z.object({ examId: uuid, ids: z.array(uuid).max(500) }).safeParse({ examId, ids: questionIds });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.rpc("reorder_questions", { p_exam_id: parsed.data.examId, p_question_ids: parsed.data.ids });
  if (error) return dbFail(error, "reorderQuestions");
  refresh();
  return ok(undefined);
}

/** Validates first; publishes only when there are no problems. */
export async function publishExamAction(examId: string): Promise<ActionResult<{ problems: string[] }>> {
  const id = uuid.safeParse(examId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data: problems, error } = await supabase.rpc("validate_exam_for_publish", { p_exam_id: id.data });
  if (error) return dbFail(error, "validateExam");
  if (problems.length) return ok({ problems });
  const { error: pubErr } = await supabase.rpc("publish_exam", { p_exam_id: id.data });
  if (pubErr) return dbFail(pubErr, "publishExam");
  await announceExam(supabase, id.data);
  refresh();
  return ok({ problems: [] }, "Exam published");
}

const LIFECYCLE = {
  unpublish: { rpc: "unpublish_exam", message: "Exam moved back to draft" },
  close: { rpc: "close_exam", message: "Exam closed. Open attempts were submitted." },
  archive: { rpc: "archive_exam", message: "Exam archived" },
  restore: { rpc: "restore_exam", message: "Exam restored" },
  publishResults: { rpc: "publish_results", message: "Results published to students" },
  unpublishResults: { rpc: "unpublish_results", message: "Results hidden from students" },
} as const;

export async function examLifecycleAction(examId: string, op: keyof typeof LIFECYCLE): Promise<ActionResult> {
  const id = uuid.safeParse(examId);
  if (!id.success || !(op in LIFECYCLE)) return fail("Invalid request.");
  const { supabase } = await requireTeacher();
  const { rpc, message } = LIFECYCLE[op];
  const { error } = await supabase.rpc(rpc, { p_exam_id: id.data });
  if (error) return dbFail(error, `exam.${op}`);
  // Publishing results or closing the exam can release results (and answer keys) to students.
  if (op === "publishResults" || op === "close") await notifyReleasedResults(supabase, id.data);
  refresh();
  return ok(undefined, message);
}

export async function duplicateExamAction(examId: string): Promise<ActionResult> {
  const id = uuid.safeParse(examId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.rpc("duplicate_exam", { p_exam_id: id.data });
  if (error) return dbFail(error, "duplicateExam");
  redirect(`/teacher/exams/${data}`);
}

export async function deleteExamAction(examId: string): Promise<ActionResult> {
  const id = uuid.safeParse(examId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("exams").delete().eq("id", id.data).select("id");
  if (error) return dbFail(error, "deleteExam");
  if (!data.length) return fail("Exam not found.");
  redirect("/teacher/exams");
}

export async function correctAnswerKeyAction(questionId: string, optionId: string): Promise<ActionResult<{ regraded: number }>> {
  const parsed = z.object({ q: uuid, o: uuid }).safeParse({ q: questionId, o: optionId });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.rpc("correct_answer_key", { p_question_id: parsed.data.q, p_correct_option_id: parsed.data.o });
  if (error) return dbFail(error, "correctAnswerKey");
  refresh();
  return ok({ regraded: data }, `Answer key corrected. ${data} attempt(s) regraded.`);
}
