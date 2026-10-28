"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent, requireTeacher } from "@/lib/auth/dal";
import { dbFail, fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { generateInviteCode, hashInviteCode, inviteCodeHint } from "@/lib/utils/invite-code";
import {
  chapterSchema,
  courseSchema,
  enrollByEmailSchema,
  inviteSchema,
  joinCourseSchema,
  memberStatusSchema,
  renameSchema,
  subjectSchema,
  uuid,
} from "@/lib/validations/courses";

export async function createCourseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const { data, error } = await supabase
    .from("courses")
    .insert({ ...parsed.data, teacher_id: profile.id })
    .select("id")
    .single();
  if (error) return dbFail(error, "createCourse");
  refresh();
  return ok({ id: data.id }, "Course created");
}

export async function updateCourseAction(courseId: string, input: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(courseId);
  const parsed = courseSchema.safeParse(input);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("courses").update(parsed.data).eq("id", id.data).select("id");
  if (error) return dbFail(error, "updateCourse");
  if (!data.length) return fail("Course not found.");
  refresh();
  return ok(undefined, "Course updated");
}

export async function setCourseArchivedAction(courseId: string, archived: boolean): Promise<ActionResult> {
  const id = uuid.safeParse(courseId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase
    .from("courses")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id.data)
    .select("id");
  if (error) return dbFail(error, "archiveCourse");
  if (!data.length) return fail("Course not found.");
  refresh();
  return ok(undefined, archived ? "Course archived" : "Course restored");
}

/** Creates an invitation. The plaintext code is returned once and only its hash is stored. */
export async function createInviteAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { profile, supabase } = await requireTeacher();
  const code = generateInviteCode();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
    : null;
  const { error } = await supabase.from("course_invites").insert({
    course_id: parsed.data.courseId,
    code_hash: hashInviteCode(code),
    code_hint: inviteCodeHint(code),
    label: parsed.data.label,
    expires_at: expiresAt,
    max_uses: parsed.data.maxUses,
    created_by: profile.id,
  });
  if (error) return dbFail(error, "createInvite");
  refresh();
  return ok({ code }, "Invitation created");
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const id = uuid.safeParse(inviteId);
  if (!id.success) return invalid(id.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase
    .from("course_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("revoked_at", null)
    .select("id");
  if (error) return dbFail(error, "revokeInvite");
  if (!data.length) return fail("Invitation not found or already revoked.");
  refresh();
  return ok(undefined, "Invitation revoked");
}

export async function setMemberStatusAction(input: unknown): Promise<ActionResult> {
  const parsed = memberStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase
    .from("course_members")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.memberId)
    .select("id");
  if (error) return dbFail(error, "setMemberStatus");
  if (!data.length) return fail("Enrollment not found.");
  refresh();
  const labels = { active: "Student reactivated", suspended: "Student suspended", removed: "Student removed from course" };
  return ok(undefined, labels[parsed.data.status]);
}

export async function enrollByEmailAction(input: unknown): Promise<ActionResult> {
  const parsed = enrollByEmailSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.rpc("enroll_student_by_email", {
    p_course_id: parsed.data.courseId,
    p_email: parsed.data.email,
  });
  if (error) return dbFail(error, "enrollByEmail");
  refresh();
  return ok(undefined, data === "already_enrolled" ? "Student is already enrolled" : "Student enrolled");
}

export async function createSubjectAction(input: unknown): Promise<ActionResult> {
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("subjects").insert({ course_id: parsed.data.courseId, name: parsed.data.name });
  if (error) return error.code === "23505" ? fail("A subject with that name already exists.") : dbFail(error, "createSubject");
  refresh();
  return ok(undefined, "Subject added");
}

export async function createChapterAction(input: unknown): Promise<ActionResult> {
  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { count } = await supabase.from("chapters").select("id", { count: "exact", head: true }).eq("subject_id", parsed.data.subjectId);
  const { error } = await supabase
    .from("chapters")
    .insert({ subject_id: parsed.data.subjectId, name: parsed.data.name, position: count ?? 0 });
  if (error) return error.code === "23505" ? fail("A chapter with that name already exists.") : dbFail(error, "createChapter");
  refresh();
  return ok(undefined, "Chapter added");
}

const taxonomyKind = z.enum(["subjects", "chapters"]);

export async function renameTaxonomyAction(kind: "subjects" | "chapters", input: unknown): Promise<ActionResult> {
  const table = taxonomyKind.safeParse(kind);
  const parsed = renameSchema.safeParse(input);
  if (!table.success) return invalid(table.error);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from(table.data).update({ name: parsed.data.name }).eq("id", parsed.data.id).select("id");
  if (error) return error.code === "23505" ? fail("That name is already used.") : dbFail(error, "renameTaxonomy");
  if (!data.length) return fail("Not found.");
  refresh();
  return ok(undefined, "Renamed");
}

export async function deleteTaxonomyAction(kind: "subjects" | "chapters", id: string): Promise<ActionResult> {
  const table = taxonomyKind.safeParse(kind);
  const parsedId = uuid.safeParse(id);
  if (!table.success) return invalid(table.error);
  if (!parsedId.success) return invalid(parsedId.error);
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from(table.data).delete().eq("id", parsedId.data).select("id");
  if (error) return dbFail(error, "deleteTaxonomy");
  if (!data.length) return fail("Not found.");
  refresh();
  return ok(undefined, kind === "subjects" ? "Subject deleted" : "Chapter deleted");
}

const JOIN_MESSAGES: Record<string, string> = {
  invalid: "That code isn't valid. Check it with your teacher — codes may expire or be revoked.",
  full: "This invitation has reached its limit. Ask your teacher for a new code.",
  suspended: "Your enrollment in this course is suspended. Contact your teacher.",
  rate_limited: "Too many incorrect codes. Please wait 15 minutes before trying again.",
  not_a_student: "Only student accounts can join courses.",
};

export async function joinCourseAction(input: unknown): Promise<ActionResult<{ courseId: string }>> {
  const parsed = joinCourseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireStudent();
  const { data, error } = await supabase.rpc("redeem_course_invite", { p_code: parsed.data.code });
  if (error) return dbFail(error, "joinCourse");
  const result = data?.[0];
  if (!result) return fail(JOIN_MESSAGES.invalid);
  if ((result.status === "joined" || result.status === "already_enrolled") && result.course_id) {
    refresh();
    return ok(
      { courseId: result.course_id },
      result.status === "joined" ? `You've joined ${result.course_title}` : `You're already enrolled in ${result.course_title}`,
    );
  }
  return fail(JOIN_MESSAGES[result.status] ?? JOIN_MESSAGES.invalid);
}
