import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { requireTeacher } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";
import { getAttemptForGrading } from "@/features/grading/queries";
import { GradingWorkspace } from "@/features/grading/components/grading-workspace";
import { GRADING_META } from "@/features/exams/status";

async function Grading({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!uuid.safeParse(attemptId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  await supabase.rpc("finalize_expired_attempts");
  const data = await getAttemptForGrading(supabase, attemptId);
  if (!data) notFound();
  const { attempt, result, events } = data;
  const tz = profile.timezone;
  const hidden = events.filter((e) => e.event_type === "visibility_hidden").length;
  const offline = events.filter((e) => e.event_type === "went_offline").length;
  const exam = attempt.exam!;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Exams", href: "/teacher/exams" },
          { label: exam.title, href: `/teacher/exams/${exam.id}` },
          { label: "Attempts", href: `/teacher/exams/${exam.id}/attempts` },
          { label: attempt.student?.full_name || "Student" },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {attempt.student?.full_name || "Student"}
            {attempt.status === "in_progress" ? <Badge tone="info">In progress</Badge> : attempt.status === "returned" ? <Badge tone="warning">Returned for correction</Badge> : null}
            {result ? <Badge tone={GRADING_META[result.grading_status].tone}>{GRADING_META[result.grading_status].label}</Badge> : null}
          </span>
        }
        description={`${exam.title} · Attempt ${attempt.attempt_number} · Started ${formatDateTime(attempt.started_at, tz)}${
          attempt.submitted_at ? ` · Submitted ${formatDateTime(attempt.submitted_at, tz)}${attempt.submitted_via === "timeout" ? " (time up)" : ""}` : ""
        }`}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="surface p-3.5">
          <p className="text-subtle">Total</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? `${Number(result.total_score)}/${Number(result.max_score)}` : "—"}</p>
          {result ? <p className="text-xs text-muted-foreground">{Number(result.percentage)}%{result.passed === null ? "" : result.passed ? " · Pass" : " · Below pass mark"}</p> : null}
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle">MCQ (auto)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? Number(result.mcq_score) : "—"}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle">Written (final)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? Number(result.cq_score) : "—"}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle">Integrity signals</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{hidden}</p>
          <p className="text-xs text-muted-foreground">
            tab left · {offline} offline · best-effort only
          </p>
        </div>
      </div>
      {attempt.status === "returned" && attempt.return_note ? (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Returned with note: {attempt.return_note} (due {formatDateTime(attempt.resubmit_deadline_at, tz)})
        </p>
      ) : null}
      <GradingWorkspace data={data} />
    </>
  );
}

export default function TeacherAttemptPage({ params }: PageProps<"/teacher/attempts/[attemptId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <Grading params={params} />
    </Suspense>
  );
}
