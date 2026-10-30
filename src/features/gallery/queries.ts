import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export type GalleryImage = {
  id: string;
  noteId: string;
  title: string;
  subject: string;
  chapter: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string | null;
};

export async function listGalleryImages(
  supabase: ServerSupabase,
  filters?: { subject?: string; search?: string },
): Promise<GalleryImage[]> {
  const query = supabase
    .from("study_files")
    .select("id, note_id, storage_path, file_name, mime_type, size_bytes, created_at, study_notes(id, title, subject, chapter, tags)")
    .ilike("mime_type", "image/%")
    .order("created_at", { ascending: false })
    .limit(300);

  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return [];

  let filtered = data;
  if (filters?.subject && filters.subject !== "all") {
    filtered = filtered.filter((f) => {
      const note = f.study_notes as { subject?: string } | null;
      return note?.subject?.toLowerCase() === filters.subject?.toLowerCase();
    });
  }

  if (filters?.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter((f) => {
      const note = f.study_notes as { title?: string; subject?: string; chapter?: string } | null;
      return (
        f.file_name.toLowerCase().includes(s) ||
        note?.title?.toLowerCase().includes(s) ||
        note?.subject?.toLowerCase().includes(s)
      );
    });
  }

  const paths = filtered.map((f) => f.storage_path);
  const signed = paths.length
    ? ((await supabase.storage.from("study-files").createSignedUrls(paths, 3600)).data ?? [])
    : [];
  const urlMap = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return filtered.map((f) => {
    const note = f.study_notes as { id: string; title: string; subject: string; chapter: string } | null;
    return {
      id: f.id,
      noteId: f.note_id,
      title: note?.title || f.file_name,
      subject: note?.subject || "General",
      chapter: note?.chapter || "",
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      createdAt: f.created_at,
      url: urlMap.get(f.storage_path) ?? null,
    };
  });
}

export async function getGalleryTaxonomy(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("study_files")
    .select("study_notes(subject)")
    .ilike("mime_type", "image/%")
    .limit(500);

  if (error) throw error;
  const subjectsMap = new Map<string, number>();

  for (const item of data || []) {
    const note = item.study_notes as { subject?: string } | null;
    const sub = note?.subject || "General";
    subjectsMap.set(sub, (subjectsMap.get(sub) ?? 0) + 1);
  }

  return [...subjectsMap.entries()].map(([name, count]) => ({ name, count }));
}
