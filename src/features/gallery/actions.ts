"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { uuid } from "@/lib/validations/courses";

const createAlbumSchema = z.object({
  title: z.string().trim().min(2, "Enter an album/topic title").max(120),
  subject: z.string().trim().max(100).default("General"),
  chapter: z.string().trim().max(150).default(""),
});

/** Creates or finds a gallery collection note so images can be attached to it */
export async function createGalleryAlbumAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createAlbumSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireStudent();

  const { data, error } = await supabase
    .from("study_notes")
    .insert({
      owner_id: profile.id,
      title: parsed.data.title,
      subject: parsed.data.subject || "General",
      chapter: parsed.data.chapter || "Photo Gallery",
      body: "Study photo collection",
      tags: ["gallery", "photos"],
    })
    .select("id")
    .single();

  if (error) return dbFail(error, "createGalleryAlbum");
  refresh();
  return ok({ id: data.id }, "Gallery collection created");
}

export async function deleteGalleryPhotoAction(fileId: string): Promise<ActionResult> {
  const id = uuid.safeParse(fileId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireStudent();

  const { data, error } = await supabase.from("study_files").delete().eq("id", id.data).select("storage_path");
  if (error) return dbFail(error, "deleteGalleryPhoto");
  if (!data?.length) return fail("Photo not found.");

  await supabase.storage.from("study-files").remove([data[0].storage_path]);
  refresh();
  return ok(undefined, "Photo deleted");
}
