import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export type NoteFilters = { q?: string; subject?: string; chapter?: string; tag?: string };

export async function listNotes(supabase: ServerSupabase, filters: NoteFilters) {
  let query = supabase
    .from("study_notes")
    .select("id, title, subject, chapter, tags, body, updated_at, study_files(id)")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (filters.q) query = query.textSearch("search", filters.q, { type: "websearch", config: "simple" });
  if (filters.subject) query = query.eq("subject", filters.subject);
  if (filters.chapter) query = query.eq("chapter", filters.chapter);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((n) => ({ ...n, excerpt: n.body.slice(0, 220), attachments: n.study_files.length }));
}

/** Subjects → chapters → counts, for the organiser sidebar and form suggestions. */
export async function noteTaxonomy(supabase: ServerSupabase) {
  const { data, error } = await supabase.from("study_notes").select("subject, chapter, tags").limit(2000);
  if (error) throw error;
  const subjects = new Map<string, Map<string, number>>();
  const tags = new Map<string, number>();
  for (const n of data) {
    const s = n.subject || "";
    const chapters = subjects.get(s) ?? new Map<string, number>();
    chapters.set(n.chapter || "", (chapters.get(n.chapter || "") ?? 0) + 1);
    subjects.set(s, chapters);
    for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return {
    subjects: [...subjects.entries()]
      .sort(([a], [b]) => (a || "~").localeCompare(b || "~"))
      .map(([name, chapters]) => ({
        name,
        count: [...chapters.values()].reduce((a, b) => a + b, 0),
        chapters: [...chapters.entries()].sort(([a], [b]) => (a || "~").localeCompare(b || "~")).map(([chapter, count]) => ({ name: chapter, count })),
      })),
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  };
}

export async function getNote(supabase: ServerSupabase, noteId: string) {
  const { data, error } = await supabase
    .from("study_notes")
    .select("id, title, subject, chapter, body, tags, created_at, updated_at, study_files(id, storage_path, file_name, mime_type, size_bytes, created_at)")
    .eq("id", noteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const paths = data.study_files.map((f) => f.storage_path);
  const signed = paths.length ? ((await supabase.storage.from("study-files").createSignedUrls(paths, 3600)).data ?? []) : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return { ...data, files: data.study_files.map((f) => ({ id: f.id, fileName: f.file_name, mimeType: f.mime_type, sizeBytes: f.size_bytes, url: urls.get(f.storage_path) ?? null })) };
}
export type NoteDetail = NonNullable<Awaited<ReturnType<typeof getNote>>>;
