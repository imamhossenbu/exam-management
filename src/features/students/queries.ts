import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listStudents(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, created_at, course_members!course_members_student_id_fkey(status, course:courses(id, title))")
    .eq("role", "student")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((p) => {
    const active = p.course_members.filter((m) => m.status === "active");
    return {
      id: p.id,
      name: p.full_name || "Unnamed student",
      email: p.email ?? "",
      joinedAt: p.created_at,
      activeCourses: active.length,
      courseTitles: active.map((m) => m.course?.title ?? "").filter(Boolean).join(", "),
      enrollment: active.length > 0 ? "enrolled" : p.course_members.length > 0 ? "inactive" : "not_enrolled",
    };
  });
}
export type StudentRow = Awaited<ReturnType<typeof listStudents>>[number];

export async function getStudentDetail(supabase: ServerSupabase, studentId: string) {
  const [profile, memberships, attempts] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at, role").eq("id", studentId).eq("role", "student").maybeSingle(),
    supabase
      .from("course_members")
      .select("id, status, joined_at, course:courses(id, title)")
      .eq("student_id", studentId)
      .order("joined_at", { ascending: false }),
    supabase
      .from("exam_attempts")
      .select(
        "id, attempt_number, status, started_at, submitted_at, exam:exams(id, title, total_marks, course:courses(title)), result:attempt_results(total_score, max_score, percentage, passed, grading_status)",
      )
      .eq("student_id", studentId)
      .order("started_at", { ascending: false }),
  ]);
  for (const r of [profile, memberships, attempts]) if (r.error) throw r.error;
  if (!profile.data) return null;
  return { profile: profile.data, memberships: memberships.data ?? [], attempts: attempts.data ?? [] };
}
