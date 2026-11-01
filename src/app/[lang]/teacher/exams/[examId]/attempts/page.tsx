import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { listAttempts } from "@/features/grading/queries";
import { AttemptsTable } from "@/features/grading/components/attempts-table";
import { LateAttemptsPanel } from "@/features/grading/components/extra-time";
import { requestTime } from "@/lib/utils/now";
import { T } from "@/lib/i18n/client";

async function Attempts({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!uuid.safeParse(examId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  const { data: exam } = await supabase.from("exams").select("id, title, course_id, status, ends_at, reveal_answers").eq("id", examId).maybeSingle();
  if (!exam) notFound();
  const [attempts, members, extensions] = await Promise.all([
    listAttempts(supabase, { examId }),
    supabase
      .from("course_members")
      .select("student:profiles!course_members_student_id_fkey(id, full_name, email)")
      .eq("course_id", exam.course_id)
      .eq("status", "active"),
    supabase.from("exam_extensions").select("id, student_id, starts_at, ends_at, note, used_at, revoked_at").eq("exam_id", exam.id).order("created_at", { ascending: false }),
  ]);
  if (members.error) throw members.error;
  if (extensions.error) throw extensions.error;
  const now = requestTime();
  const students = (members.data ?? [])
    .flatMap((m) => (m.student ? [{ id: m.student.id, name: m.student.full_name, email: m.student.email ?? "" }] : []))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  // Correct answers (and after-close results) are out once the window has ended for everyone.
  const answersMayBeOut = exam.status === "closed" || exam.status === "archived" || new Date(exam.ends_at).getTime() <= now;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/teacher/exams" }, { label: exam.title, href: `/teacher/exams/${exam.id}` }, { label: "Attempts" }]}
        title="Attempts"
        description="Tab-switch counts are a best-effort signal only; a web page can't prevent or prove off-screen activity."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/results?examId=${exam.id}`} download>
              <Download aria-hidden /> <T>Export CSV</T>
            </a>
          </Button>
        }
      />
      {exam.status === "published" || exam.status === "closed" ? (
        <LateAttemptsPanel
          examId={exam.id}
          students={students}
          extensions={(extensions.data ?? []).map((x) => ({
            id: x.id,
            studentId: x.student_id,
            startsAt: x.starts_at,
            endsAt: x.ends_at,
            note: x.note,
            usedAt: x.used_at,
            revokedAt: x.revoked_at,
          }))}
          timezone={profile.timezone}
          answersMayBeOut={answersMayBeOut}
          now={now}
        />
      ) : null}
      <AttemptsTable attempts={attempts} timezone={profile.timezone} showExam={false} />
    </>
  );
}

export default function ExamAttemptsPage({ params }: PageProps<"/[lang]/teacher/exams/[examId]/attempts">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <TableSkeleton columns={7} />
        </>
      }
    >
      <Attempts params={params} />
    </Suspense>
  );
}
