"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS } from "@/lib/utils/files";
import { uuid } from "@/lib/validations/courses";
import { noteSchema } from "@/lib/validations/notes";

export async function createNoteAction(input: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireStudent();
  const { data, error } = await supabase.from("study_notes").insert({ ...parsed.data, owner_id: profile.id }).select("id").single();
  if (error) return dbFail(error, "createNote");
  redirect(`/student/notes/${data.id}?created=1`);
}

export async function updateNoteAction(noteId: string, input: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(noteId);
  const parsed = noteSchema.safeParse(input);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireStudent();
  const { data, error } = await supabase.from("study_notes").update(parsed.data).eq("id", id.data).select("id");
  if (error) return dbFail(error, "updateNote");
  if (!data.length) return fail("Note not found.");
  refresh();
  return ok(undefined, "Note saved");
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const id = uuid.safeParse(noteId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireStudent();
  const { data: files } = await supabase.from("study_files").select("storage_path").eq("note_id", id.data);
  const { data, error } = await supabase.from("study_notes").delete().eq("id", id.data).select("id");
  if (error) return dbFail(error, "deleteNote");
  if (!data.length) return fail("Note not found.");
  if (files?.length) await supabase.storage.from("study-files").remove(files.map((f) => f.storage_path));
  redirect("/student/notes");
}

const fileSchema = z.object({
  noteId: uuid,
  storagePath: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ACCEPTED_DOCUMENT_TYPES),
  sizeBytes: z.number().int().positive().max(LIMITS.studyFile),
});

export async function registerStudyFileAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireStudent();
  if (!parsed.data.storagePath.startsWith(`${profile.id}/${parsed.data.noteId}/`)) return fail("Invalid file location.");
  const { data, error } = await supabase
    .from("study_files")
    .insert({
      note_id: parsed.data.noteId,
      owner_id: profile.id,
      storage_path: parsed.data.storagePath,
      file_name: parsed.data.fileName,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
    })
    .select("id")
    .single();
  if (error) return dbFail(error, "registerStudyFile");
  refresh();
  return ok({ id: data.id }, "Attachment added");
}

export async function deleteStudyFileAction(fileId: string): Promise<ActionResult> {
  const id = uuid.safeParse(fileId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireStudent();
  const { data, error } = await supabase.from("study_files").delete().eq("id", id.data).select("storage_path");
  if (error) return dbFail(error, "deleteStudyFile");
  if (!data.length) return fail("Attachment not found.");
  await supabase.storage.from("study-files").remove([data[0].storage_path]);
  refresh();
  return ok(undefined, "Attachment removed");
}
