import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Attempts across the teacher's exams, newest first. Expired attempts are finalized first. */
export async function listAttempts(supabase: ServerSupabase, filter: { examId?: string; needsGrading?: boolean } = {}) {
  await supabase.rpc("finalize_expired_attempts");
  let query = supabase
    .from("exam_attempts")
    .select(
      "id, attempt_number, status, started_at, submitted_at, submitted_via, deadline_at, exam:exams!inner(id, title, exam_type, total_marks, course:courses(id, title)), student:profiles!exam_attempts_student_id_fkey(id, full_name, email), result:attempt_results(total_score, max_score, percentage, passed, grading_status, mcq_score, cq_score), attempt_events(event_type)",
    )
    .order("started_at", { ascending: false })
    .limit(2000);
  if (filter.examId) query = query.eq("exam_id", filter.examId);
  if (filter.needsGrading) query = query.eq("status", "submitted");
  const { data, error } = await query;
  if (error) throw error;
  const rows = data.map((a) => ({
    id: a.id,
    attemptNumber: a.attempt_number,
    status: a.status,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    submittedVia: a.submitted_via,
    examId: a.exam.id,
    examTitle: a.exam.title,
    examType: a.exam.exam_type,
    courseId: a.exam.course?.id ?? "",
    courseTitle: a.exam.course?.title ?? "",
    studentId: a.student?.id ?? "",
    studentName: a.student?.full_name || "Unnamed student",
    studentEmail: a.student?.email ?? "",
    score: a.result ? Number(a.result.total_score) : null,
    maxScore: a.result ? Number(a.result.max_score) : Number(a.exam.total_marks),
    percentage: a.result ? Number(a.result.percentage) : null,
    passed: a.result?.passed ?? null,
    mcqScore: a.result ? Number(a.result.mcq_score) : null,
    cqScore: a.result ? Number(a.result.cq_score) : null,
    gradingStatus: a.status === "in_progress" ? ("in_progress" as const) : (a.result?.grading_status ?? "pending"),
    tabSwitches: a.attempt_events.filter((e) => e.event_type === "visibility_hidden").length,
  }));
  return filter.needsGrading ? rows.filter((r) => r.gradingStatus === "pending" || r.gradingStatus === "in_review") : rows;
}
export type AttemptRow = Awaited<ReturnType<typeof listAttempts>>[number];

export async function getAttemptForGrading(supabase: ServerSupabase, attemptId: string) {
  const { data: attempt, error } = await supabase
    .from("exam_attempts")
    .select("*, student:profiles!exam_attempts_student_id_fkey(id, full_name, email), exam:exams(id, title, exam_type, total_marks, pass_marks, allow_resubmission, course:courses(title))")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt || !attempt.exam) return null;

  const [questions, answers, files, grades, annotations, result, events] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, position, body, image_path, marks, negative_marks, question_options(id, body, position), question_parts(id, label, body, marks, position), question_answer_keys(correct_option_id, explanation, model_answer, rubric)")
      .eq("exam_id", attempt.exam.id)
      .order("position"),
    supabase.from("student_answers").select("question_id, selected_option_id, text_answer, marked_for_review, saved_at").eq("attempt_id", attemptId),
    supabase.from("answer_files").select("id, question_id, part_id, storage_path, file_name, mime_type, size_bytes, page_order").eq("attempt_id", attemptId).order("page_order"),
    supabase.from("grades").select("id, question_id, part_id, marks_awarded, max_marks, is_auto, feedback, status").eq("attempt_id", attemptId),
    supabase.from("answer_annotations").select("id, answer_file_id, page, kind, x, y, x2, y2, body").eq("attempt_id", attemptId).order("created_at"),
    supabase.from("attempt_results").select("*").eq("attempt_id", attemptId).maybeSingle(),
    supabase.from("attempt_events").select("event_type, occurred_at").eq("attempt_id", attemptId).order("occurred_at"),
  ]);
  for (const r of [questions, answers, files, grades, annotations, result, events]) if (r.error) throw r.error;

  const paths = (files.data ?? []).map((f) => f.storage_path);
  const imgPaths = (questions.data ?? []).map((q) => q.image_path).filter((p): p is string => Boolean(p));
  const [fs, qs] = await Promise.all([
    paths.length ? supabase.storage.from("answer-sheets").createSignedUrls(paths, 3600) : Promise.resolve({ data: [] }),
    imgPaths.length ? supabase.storage.from("question-assets").createSignedUrls(imgPaths, 3600) : Promise.resolve({ data: [] }),
  ]);
  const fileUrls = new Map((fs.data ?? []).map((s) => [s.path, s.signedUrl]));
  const qUrls = new Map((qs.data ?? []).map((s) => [s.path, s.signedUrl]));
  const order = new Map(attempt.question_order.map((id, i) => [id, i]));

  return {
    attempt,
    result: result.data,
    events: events.data ?? [],
    questions: (questions.data ?? []).map((q) => ({
      id: q.id,
      type: q.type,
      body: q.body,
      imageUrl: q.image_path ? (qUrls.get(q.image_path) ?? null) : null,
      marks: Number(q.marks),
      negativeMarks: Number(q.negative_marks),
      studentPosition: order.get(q.id) ?? null,
      options: [...q.question_options].sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, body: o.body })),
      parts: [...q.question_parts].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, label: p.label, body: p.body, marks: Number(p.marks) })),
      correctOptionId: q.question_answer_keys?.correct_option_id ?? null,
      explanation: q.question_answer_keys?.explanation ?? null,
      modelAnswer: q.question_answer_keys?.model_answer ?? null,
      rubric: q.question_answer_keys?.rubric ?? null,
    })),
    answers: answers.data ?? [],
    files: (files.data ?? []).map((f) => ({ id: f.id, questionId: f.question_id, partId: f.part_id, fileName: f.file_name, mimeType: f.mime_type, url: fileUrls.get(f.storage_path) ?? null })),
    grades: (grades.data ?? []).map((g) => ({ ...g, marks_awarded: Number(g.marks_awarded), max_marks: Number(g.max_marks) })),
    annotations: (annotations.data ?? []).map((a) => ({ ...a, x: Number(a.x), y: Number(a.y), x2: a.x2 === null ? null : Number(a.x2), y2: a.y2 === null ? null : Number(a.y2) })),
  };
}
export type GradingData = NonNullable<Awaited<ReturnType<typeof getAttemptForGrading>>>;
export type GradingQuestion = GradingData["questions"][number];
export type GradingFile = GradingData["files"][number];
export type Annotation = GradingData["annotations"][number];
