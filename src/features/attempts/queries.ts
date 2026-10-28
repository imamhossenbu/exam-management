import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listStudentCourses(supabase: ServerSupabase, studentId: string) {
  const { data, error } = await supabase
    .from("course_members")
    .select("id, status, joined_at, course:courses(id, title, code, description, archived_at, exams(id, status))")
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return data
    .filter((m) => m.course)
    .map((m) => ({
      id: m.course!.id,
      title: m.course!.title,
      code: m.course!.code,
      description: m.course!.description,
      archived: Boolean(m.course!.archived_at),
      joinedAt: m.joined_at,
      examCount: m.course!.exams.filter((e) => e.status !== "draft").length,
    }));
}

export async function listStudentExams(supabase: ServerSupabase, studentId: string, courseId?: string) {
  let query = supabase
    .from("exams")
    .select("id, title, description, exam_type, status, starts_at, ends_at, duration_minutes, total_marks, max_attempts, course:courses(id, title), exam_attempts(id, status, student_id, deadline_at, attempt_number)")
    .in("status", ["published", "closed"])
    .order("starts_at", { ascending: false });
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((e) => {
    const mine = e.exam_attempts.filter((a) => a.student_id === studentId);
    const open = mine.find((a) => a.status === "in_progress");
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      examType: e.exam_type,
      status: e.status,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      durationMinutes: e.duration_minutes,
      totalMarks: Number(e.total_marks),
      maxAttempts: e.max_attempts,
      courseId: e.course?.id ?? "",
      courseTitle: e.course?.title ?? "",
      attemptsUsed: mine.length,
      openAttemptId: open && new Date(open.deadline_at).getTime() > Date.now() ? open.id : null,
      lastAttemptId: [...mine].sort((a, b) => b.attempt_number - a.attempt_number)[0]?.id ?? null,
    };
  });
}
export type StudentExamRow = Awaited<ReturnType<typeof listStudentExams>>[number];

export async function getAttemptForTaking(supabase: ServerSupabase, attemptId: string, studentId: string) {
  const { data: attempt, error } = await supabase
    .from("exam_attempts")
    .select("id, exam_id, student_id, status, started_at, deadline_at, submitted_at, question_order, option_order, return_note, resubmit_deadline_at, attempt_number")
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) return null;

  const [exam, questions, answers, files] = await Promise.all([
    supabase.from("exams").select("id, title, instructions, exam_type, total_marks, course:courses(title)").eq("id", attempt.exam_id).single(),
    supabase
      .from("questions")
      .select("id, type, body, image_path, marks, negative_marks, question_options(id, body, image_path), question_parts(id, label, body, marks, position)")
      .eq("exam_id", attempt.exam_id),
    supabase.from("student_answers").select("question_id, selected_option_id, text_answer, marked_for_review, revision, saved_at").eq("attempt_id", attempt.id),
    supabase.from("answer_files").select("id, question_id, part_id, storage_path, file_name, mime_type, size_bytes, page_order").eq("attempt_id", attempt.id).order("page_order"),
  ]);
  for (const r of [exam, questions, answers, files]) if (r.error) throw r.error;

  const imagePaths = (questions.data ?? []).map((q) => q.image_path).filter((p): p is string => Boolean(p));
  const [qSigned, fSigned] = await Promise.all([
    imagePaths.length ? supabase.storage.from("question-assets").createSignedUrls(imagePaths, 3 * 3600) : Promise.resolve({ data: [] }),
    files.data?.length ? supabase.storage.from("answer-sheets").createSignedUrls(files.data.map((f) => f.storage_path), 3 * 3600) : Promise.resolve({ data: [] }),
  ]);
  const qUrls = new Map((qSigned.data ?? []).map((s) => [s.path, s.signedUrl]));
  const fUrls = new Map((fSigned.data ?? []).map((s) => [s.path, s.signedUrl]));
  const optionOrder = (attempt.option_order ?? {}) as Record<string, string[]>;
  const byId = new Map((questions.data ?? []).map((q) => [q.id, q]));

  return {
    attempt,
    exam: exam.data!,
    questions: attempt.question_order
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q) => {
        const order = optionOrder[q.id] ?? q.question_options.map((o) => o.id);
        const opts = new Map(q.question_options.map((o) => [o.id, o]));
        return {
          id: q.id,
          type: q.type,
          body: q.body,
          imageUrl: q.image_path ? (qUrls.get(q.image_path) ?? null) : null,
          marks: Number(q.marks),
          negativeMarks: Number(q.negative_marks),
          options: order.map((id) => opts.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o)).map((o) => ({ id: o.id, body: o.body })),
          parts: [...q.question_parts].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, label: p.label, body: p.body, marks: Number(p.marks) })),
        };
      }),
    answers: answers.data ?? [],
    files: (files.data ?? []).map((f) => ({
      id: f.id,
      questionId: f.question_id,
      partId: f.part_id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      storagePath: f.storage_path,
      url: fUrls.get(f.storage_path) ?? null,
    })),
  };
}
export type AttemptForTaking = NonNullable<Awaited<ReturnType<typeof getAttemptForTaking>>>;
export type TakingQuestion = AttemptForTaking["questions"][number];
export type TakingFile = AttemptForTaking["files"][number];
