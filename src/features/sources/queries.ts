import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listSources(supabase: ServerSupabase, filter: { examId?: string } = {}) {
  let query = supabase
    .from("question_sources")
    .select("id, file_name, mime_type, size_bytes, extraction_status, extraction_error, extracted_text, storage_path, created_at, exam:exams(id, title), course:courses(id, title)")
    .order("created_at", { ascending: false });
  if (filter.examId) query = query.eq("exam_id", filter.examId);
  const { data, error } = await query;
  if (error) throw error;
  const paths = data.map((s) => s.storage_path);
  const signed = paths.length ? ((await supabase.storage.from("question-sources").createSignedUrls(paths, 1800)).data ?? []) : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return data.map((s) => ({
    id: s.id,
    fileName: s.file_name,
    mimeType: s.mime_type,
    sizeBytes: s.size_bytes,
    status: s.extraction_status,
    error: s.extraction_error,
    text: s.extracted_text ?? "",
    url: urls.get(s.storage_path) ?? null,
    createdAt: s.created_at,
    examId: s.exam?.id ?? null,
    examTitle: s.exam?.title ?? null,
    courseTitle: s.course?.title ?? null,
  }));
}
export type SourceRow = Awaited<ReturnType<typeof listSources>>[number];
