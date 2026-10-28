"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { requireTeacher } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS } from "@/lib/utils/files";
import { uuid } from "@/lib/validations/courses";
import { questionSchema, toQuestionPayload } from "@/lib/validations/exams";
import { toUserMessage } from "@/lib/errors";

const registerSchema = z.object({
  storagePath: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ACCEPTED_DOCUMENT_TYPES),
  sizeBytes: z.number().int().positive().max(LIMITS.questionSource),
  examId: z.union([uuid, z.null()]).default(null),
  courseId: z.union([uuid, z.null()]).default(null),
});

/** Records an uploaded source file. The storage policy already restricted the upload to the teacher's folder. */
export async function registerSourceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  if (!parsed.data.storagePath.startsWith(`${profile.id}/`)) return fail("Invalid file location.");
  let courseId = parsed.data.courseId;
  if (parsed.data.examId && !courseId) {
    const { data: exam } = await supabase.from("exams").select("course_id, subject_id").eq("id", parsed.data.examId).maybeSingle();
    courseId = exam?.course_id ?? null;
  }
  const { data, error } = await supabase
    .from("question_sources")
    .insert({
      teacher_id: profile.id,
      storage_path: parsed.data.storagePath,
      file_name: parsed.data.fileName,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
      exam_id: parsed.data.examId,
      course_id: courseId,
      extraction_status: parsed.data.mimeType === "application/pdf" ? "pending" : "manual",
    })
    .select("id")
    .single();
  if (error) return dbFail(error, "registerSource");
  refresh();
  return ok({ id: data.id }, "File uploaded");
}

/**
 * Extracts the embedded text layer of a PDF on the server. Scanned PDFs have no
 * text layer; they are reported as such rather than guessed at.
 */
export async function extractSourceTextAction(sourceId: string): Promise<ActionResult<{ text: string; pages: number }>> {
  const id = uuid.safeParse(sourceId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data: source, error } = await supabase.from("question_sources").select("id, storage_path, mime_type").eq("id", id.data).maybeSingle();
  if (error) return dbFail(error, "extractSource.load");
  if (!source) return fail("File not found.");
  if (source.mime_type !== "application/pdf") return fail("Text extraction runs on PDFs. For images, use “Run OCR” or type the text.");

  const { data: blob, error: dlError } = await supabase.storage.from("question-sources").download(source.storage_path);
  if (dlError || !blob) return fail("The file couldn't be downloaded from storage.");

  let text = "";
  let pages = 0;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
    const result = await extractText(pdf, { mergePages: false });
    pages = result.totalPages;
    text = result.text.map((t) => t.trim()).filter(Boolean).join("\n\n");
  } catch (e) {
    console.error("[extractSource]", e instanceof Error ? e.message : e);
    await supabase.from("question_sources").update({ extraction_status: "failed", extraction_error: "The PDF couldn't be read." }).eq("id", source.id);
    refresh();
    return fail("This PDF couldn't be read. It may be encrypted or damaged — transcribe the questions manually.");
  }

  if (!text) {
    await supabase
      .from("question_sources")
      .update({ extraction_status: "failed", extraction_error: "No text layer found (likely a scanned PDF)." })
      .eq("id", source.id);
    refresh();
    return fail("No text was found — this looks like a scanned PDF. Upload page photos for OCR, or type the questions manually.");
  }

  const { error: upErr } = await supabase
    .from("question_sources")
    .update({ extraction_status: "extracted", extracted_text: text.slice(0, 200_000), extraction_error: null })
    .eq("id", source.id);
  if (upErr) return dbFail(upErr, "extractSource.save");
  refresh();
  return ok({ text, pages }, `Extracted text from ${pages} page(s). Review it before creating questions.`);
}

export async function saveSourceTextAction(sourceId: string, text: string, origin: "manual" | "ocr"): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, text: z.string().max(200_000) }).safeParse({ id: sourceId, text });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase
    .from("question_sources")
    .update({ extracted_text: parsed.data.text, extraction_status: origin === "ocr" ? "extracted" : "manual", extraction_error: null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbFail(error, "saveSourceText");
  if (!data.length) return fail("File not found.");
  return ok(undefined, "Text saved");
}

export async function deleteSourceAction(sourceId: string): Promise<ActionResult> {
  const id = uuid.safeParse(sourceId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("question_sources").delete().eq("id", id.data).select("storage_path");
  if (error) return dbFail(error, "deleteSource");
  if (!data.length) return fail("File not found.");
  await supabase.storage.from("question-sources").remove([data[0].storage_path]);
  refresh();
  return ok(undefined, "File deleted. Questions created from it are kept.");
}

/** Saves teacher-reviewed drafts as questions of a draft exam. Nothing is published. */
export async function importReviewedQuestionsAction(examId: string, sourceId: string | null, drafts: unknown[]): Promise<ActionResult<{ count: number }>> {
  const id = uuid.safeParse(examId);
  if (!id.success) return invalid(id.error);
  if (!Array.isArray(drafts) || drafts.length === 0 || drafts.length > 200) return fail("Select at least one reviewed question.");
  const parsedDrafts = [];
  for (const [i, draft] of drafts.entries()) {
    const parsed = questionSchema.safeParse({ ...(draft as object), sourceId: sourceId && uuid.safeParse(sourceId).success ? sourceId : null });
    if (!parsed.success) return fail(`Draft ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    parsedDrafts.push(parsed.data);
  }
  const { supabase } = await requireTeacher();
  let count = 0;
  for (const draft of parsedDrafts) {
    const { error } = await supabase.rpc("save_question", { p_exam_id: id.data, p_question_id: null, p_data: toQuestionPayload(draft) });
    if (error) {
      refresh();
      return count ? fail(`Added ${count} question(s), then stopped: ${toUserMessage(error)}`) : dbFail(error, "importQuestions");
    }
    count++;
  }
  refresh();
  return ok({ count }, `Added ${count} question(s) to the exam`);
}
