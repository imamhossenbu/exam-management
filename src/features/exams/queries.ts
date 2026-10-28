import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listTeacherExams(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("exams")
    .select("id, title, exam_type, status, starts_at, ends_at, total_marks, duration_minutes, results_published_at, course:courses(id, title), questions(id), exam_attempts(id)")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    title: e.title,
    examType: e.exam_type,
    status: e.status,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    totalMarks: Number(e.total_marks),
    durationMinutes: e.duration_minutes,
    courseId: e.course?.id ?? "",
    courseTitle: e.course?.title ?? "",
    questionCount: e.questions.length,
    attemptCount: e.exam_attempts.length,
    resultsPublished: Boolean(e.results_published_at),
  }));
}
export type TeacherExamRow = Awaited<ReturnType<typeof listTeacherExams>>[number];

export async function getTeacherExam(supabase: ServerSupabase, examId: string) {
  const [exam, questions, chapters, attempts] = await Promise.all([
    supabase.from("exams").select("*, course:courses(id, title, archived_at), subject:subjects(id, name)").eq("id", examId).maybeSingle(),
    supabase
      .from("questions")
      .select("id, type, position, body, image_path, marks, negative_marks, source_id, question_options(id, body, position), question_parts(id, label, body, marks, position), question_answer_keys(correct_option_id, explanation, model_answer, rubric)")
      .eq("exam_id", examId)
      .order("position"),
    supabase.from("exam_chapters").select("chapter_id, chapter:chapters(id, name)").eq("exam_id", examId),
    supabase.from("exam_attempts").select("id, status").eq("exam_id", examId),
  ]);
  for (const r of [exam, questions, chapters, attempts]) if (r.error) throw r.error;
  if (!exam.data) return null;

  const imagePaths = (questions.data ?? []).map((q) => q.image_path).filter((p): p is string => Boolean(p));
  const signed = imagePaths.length
    ? (await supabase.storage.from("question-assets").createSignedUrls(imagePaths, 3600)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return {
    exam: exam.data,
    chapters: (chapters.data ?? []).map((c) => c.chapter).filter((c): c is { id: string; name: string } => Boolean(c)),
    attemptCount: attempts.data?.length ?? 0,
    openAttemptCount: attempts.data?.filter((a) => a.status === "in_progress").length ?? 0,
    questions: (questions.data ?? []).map((q) => {
      const options = [...q.question_options].sort((a, b) => a.position - b.position);
      const key = q.question_answer_keys;
      return {
        id: q.id,
        type: q.type,
        position: q.position,
        body: q.body,
        imagePath: q.image_path,
        imageUrl: q.image_path ? (urlByPath.get(q.image_path) ?? null) : null,
        marks: Number(q.marks),
        negativeMarks: Number(q.negative_marks),
        sourceId: q.source_id,
        options: options.map((o) => ({ id: o.id, body: o.body })),
        parts: [...q.question_parts].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, label: p.label, body: p.body, marks: Number(p.marks) })),
        correctIndex: key?.correct_option_id ? options.findIndex((o) => o.id === key.correct_option_id) : -1,
        explanation: key?.explanation ?? "",
        modelAnswer: key?.model_answer ?? "",
        rubric: key?.rubric ?? "",
      };
    }),
  };
}
export type TeacherExamDetail = NonNullable<Awaited<ReturnType<typeof getTeacherExam>>>;
export type BuilderQuestion = TeacherExamDetail["questions"][number];
