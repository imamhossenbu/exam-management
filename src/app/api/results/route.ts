import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { countedAttemptIds, listAttempts } from "@/features/grading/queries";
import { toCsv } from "@/lib/utils/csv";
import { formatDateTime, localDayBounds } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";

/** Teacher-only CSV export. RLS limits rows to the teacher's own exams; answer keys are never included. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (profile.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const examId = params.get("examId");
  const courseId = params.get("courseId");
  if ((examId && !uuid.safeParse(examId).success) || (courseId && !uuid.safeParse(courseId).success)) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });

  const supabase = await createClient();
  const bounds = localDayBounds(from, to, profile.timezone);
  const rows = await listAttempts(supabase, { examId: examId ?? undefined, courseId: courseId ?? undefined, submittedOnly: true, from: bounds.from, to: bounds.to });
  const counted = await countedAttemptIds(supabase, examId);

  const csv = toCsv([
    ["Course", "Exam", "Student", "Email", "Attempt", "Submitted", "Submission", "MCQ score", "Written score", "Total", "Max", "Percentage", "Passed", "Grading status", "Counts for result", "Tab left (count)"],
    ...rows.map((r) => [
      r.courseTitle,
      r.examTitle,
      r.studentName,
      r.studentEmail,
      r.attemptNumber,
      r.submittedAt ? formatDateTime(r.submittedAt, profile.timezone) : "",
      r.submittedVia ?? "",
      r.mcqScore,
      r.cqScore,
      r.score,
      r.maxScore,
      r.percentage,
      r.passed === null ? "" : r.passed ? "yes" : "no",
      r.gradingStatus,
      counted.has(r.id) ? "yes" : "no",
      r.tabSwitches,
    ]),
  ]);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
