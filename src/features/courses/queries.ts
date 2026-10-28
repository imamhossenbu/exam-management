import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listTeacherCourses(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, code, description, archived_at, created_at, course_members(status), exams(id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    title: c.title,
    code: c.code,
    description: c.description,
    archived: Boolean(c.archived_at),
    createdAt: c.created_at,
    activeStudents: c.course_members.filter((m) => m.status === "active").length,
    examCount: c.exams.length,
  }));
}
export type TeacherCourseRow = Awaited<ReturnType<typeof listTeacherCourses>>[number];

export async function getTeacherCourse(supabase: ServerSupabase, courseId: string) {
  const [course, members, invites, subjects, exams] = await Promise.all([
    supabase.from("courses").select("id, title, code, description, archived_at, created_at").eq("id", courseId).maybeSingle(),
    supabase
      .from("course_members")
      .select("id, status, joined_at, student:profiles!course_members_student_id_fkey(id, full_name, email)")
      .eq("course_id", courseId)
      .order("joined_at", { ascending: false }),
    supabase
      .from("course_invites")
      .select("id, code_hint, label, expires_at, max_uses, use_count, revoked_at, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("id, name, chapters(id, name, position)").eq("course_id", courseId).order("name"),
    supabase
      .from("exams")
      .select("id, title, exam_type, status, starts_at, ends_at, total_marks")
      .eq("course_id", courseId)
      .order("starts_at", { ascending: false }),
  ]);
  for (const r of [course, members, invites, subjects, exams]) if (r.error) throw r.error;
  if (!course.data) return null;
  return {
    course: course.data,
    members: (members.data ?? []).map((m) => ({
      id: m.id,
      status: m.status,
      joinedAt: m.joined_at,
      studentId: m.student?.id ?? "",
      name: m.student?.full_name || "Unnamed student",
      email: m.student?.email ?? "",
    })),
    invites: invites.data ?? [],
    subjects: (subjects.data ?? []).map((s) => ({ ...s, chapters: [...s.chapters].sort((a, b) => a.position - b.position) })),
    exams: exams.data ?? [],
  };
}
export type TeacherCourseDetail = NonNullable<Awaited<ReturnType<typeof getTeacherCourse>>>;
export type CourseMemberRow = TeacherCourseDetail["members"][number];
export type CourseInviteRow = TeacherCourseDetail["invites"][number];
export type CourseSubject = TeacherCourseDetail["subjects"][number];

export async function listCourseOptions(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, archived_at, subjects(id, name, chapters(id, name, position))")
    .order("title");
  if (error) throw error;
  return data;
}
export type CourseOption = Awaited<ReturnType<typeof listCourseOptions>>[number];
