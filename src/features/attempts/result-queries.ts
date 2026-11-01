import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Everything a student may see about their own attempt. Scores, grades and
 * annotations come back empty from RLS until results are released; answer keys
 * come from get_released_answer_keys(), which returns nothing until allowed.
 */
export async function getStudentResult(supabase: ServerSupabase, attemptId: string, studentId: string) {
  const { data: attempt, error } = await supabase
    .from("exam_attempts")
    .select("id, exam_id, status, attempt_number, submitted_at, submitted_via, question_order, return_note, resubmit_deadline_at, extended_at, extension_note, exam:exams(id, title, exam_type, total_marks, pass_marks, results_release, ends_at, status, reveal_answers, results_published_at, course:courses(title))")
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt || !attempt.exam) return null;

  const [result, grades, answers, files, annotations, keys, questions, provisional] = await Promise.all([
    supabase.from("attempt_results").select("*").eq("attempt_id", attemptId).maybeSingle(),
    supabase.from("grades").select("question_id, part_id, marks_awarded, max_marks, feedback, is_auto").eq("attempt_id", attemptId),
    supabase.from("student_answers").select("question_id, selected_option_id, text_answer").eq("attempt_id", attemptId),
    supabase.from("answer_files").select("id, question_id, part_id, storage_path, file_name, mime_type").eq("attempt_id", attemptId).order("page_order"),
    supabase.from("answer_annotations").select("id, answer_file_id, page, kind, x, y, x2, y2, body").eq("attempt_id", attemptId),
    supabase.rpc("get_released_answer_keys", { p_attempt_id: attemptId }),
    supabase.from("questions").select("id, type, body, marks, question_options(id, body, position), question_parts(id, label, body, marks, position)").eq("exam_id", attempt.exam_id),
    supabase.rpc("get_provisional_mcq", { p_attempt_id: attemptId }),
  ]);
  for (const r of [result, grades, answers, files, annotations, keys, questions, provisional]) if (r.error) throw r.error;

  const paths = (files.data ?? []).map((f) => f.storage_path);
  const signed = paths.length ? ((await supabase.storage.from("answer-sheets").createSignedUrls(paths, 3600)).data ?? []) : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const byId = new Map((questions.data ?? []).map((q) => [q.id, q]));
  const keyById = new Map((keys.data ?? []).map((k) => [k.question_id, k]));

  return {
    attempt,
    exam: attempt.exam,
    result: result.data,
    /** Mixed exams with "show MCQ score early": the MCQ total before the written part is graded. */
    provisionalMcq: provisional.data?.[0] ? { score: Number(provisional.data[0].mcq_score), max: Number(provisional.data[0].mcq_max) } : null,
    keysReleased: (keys.data ?? []).length > 0,
    questions: attempt.question_order
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q) => ({
        id: q.id,
        type: q.type,
        body: q.body,
        marks: Number(q.marks),
        options: [...q.question_options].sort((a, b) => a.position - b.position),
        parts: [...q.question_parts].sort((a, b) => a.position - b.position).map((p) => ({ ...p, marks: Number(p.marks) })),
        key: keyById.get(q.id) ?? null,
        answer: answers.data?.find((a) => a.question_id === q.id) ?? null,
        grades: (grades.data ?? []).filter((g) => g.question_id === q.id).map((g) => ({ ...g, marks_awarded: Number(g.marks_awarded), max_marks: Number(g.max_marks) })),
        files: (files.data ?? [])
          .filter((f) => f.question_id === q.id)
          .map((f) => ({ id: f.id, partId: f.part_id, fileName: f.file_name, mimeType: f.mime_type, url: urls.get(f.storage_path) ?? null })),
      })),
    annotations: (annotations.data ?? []).map((a) => ({ ...a, x: Number(a.x), y: Number(a.y), x2: a.x2 === null ? null : Number(a.x2), y2: a.y2 === null ? null : Number(a.y2) })),
  };
}

export async function listStudentResults(supabase: ServerSupabase, studentId: string) {
  const [{ data, error }, counted] = await Promise.all([
    supabase
      .from("exam_attempts")
      .select("id, attempt_number, status, submitted_at, exam:exams(id, title, total_marks, course:courses(title)), result:attempt_results(total_score, max_score, percentage, passed)")
      .eq("student_id", studentId)
      .neq("status", "in_progress")
      .order("submitted_at", { ascending: false }),
    supabase.from("counted_attempts").select("attempt_id").eq("student_id", studentId),
  ]);
  if (error) throw error;
  if (counted.error) throw counted.error;
  const countedIds = new Set((counted.data ?? []).map((c) => c.attempt_id));
  const perExam = new Map<string, number>();
  for (const a of data) if (a.exam) perExam.set(a.exam.id, (perExam.get(a.exam.id) ?? 0) + 1);
  return data.map((a) => ({
    id: a.id,
    attemptNumber: a.attempt_number,
    status: a.status,
    submittedAt: a.submitted_at,
    examTitle: a.exam?.title ?? "",
    courseTitle: a.exam?.course?.title ?? "",
    released: Boolean(a.result),
    score: a.result ? Number(a.result.total_score) : null,
    maxScore: a.result ? Number(a.result.max_score) : Number(a.exam?.total_marks ?? 0),
    percentage: a.result ? Number(a.result.percentage) : null,
    passed: a.result?.passed ?? null,
    /** This attempt is the student's result for the exam (best or latest, per exam setting). */
    counted: countedIds.has(a.id),
    /** The student has more than one attempt at this exam. */
    multipleAttempts: (perExam.get(a.exam?.id ?? "") ?? 0) > 1,
  }));
}
export type StudentResultRow = Awaited<ReturnType<typeof listStudentResults>>[number];
