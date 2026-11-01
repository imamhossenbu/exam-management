import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { requireTeacher } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { getAttemptForGrading } from "@/features/grading/queries";
import { GradingWorkspace } from "@/features/grading/components/grading-workspace";
import { GRADING_META } from "@/features/exams/status";
import { T } from "@/lib/i18n/client";
import { getFormatters, getRouteT } from "@/lib/i18n/route";

async function Grading({ params }: { params: Promise<{ attemptId: string }> }) {
  const [t, f] = await Promise.all([getRouteT(), getFormatters()]);
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
            {attempt.status === "in_progress" ? <Badge tone="info"><T>In progress</T></Badge> : attempt.status === "returned" ? <Badge tone="warning"><T>Returned for correction</T></Badge> : null}
            {result ? <Badge tone={GRADING_META[result.grading_status].tone}>{GRADING_META[result.grading_status].label}</Badge> : null}
            {attempt.extended_at ? <Badge tone="warning"><T>Extra time</T></Badge> : null}
          </span>
        }
        description={[
          exam.title,
          t("Attempt {n}", { n: attempt.attempt_number }),
          t("Started {when}", { when: f.dateTime(attempt.started_at, tz) }),
          attempt.submitted_at
            ? t(attempt.submitted_via === "timeout" ? "Submitted {when} (time up)" : "Submitted {when}", { when: f.dateTime(attempt.submitted_at, tz) })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="surface p-3.5">
          <p className="text-subtle"><T>Total</T></p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? `${Number(result.total_score)}/${Number(result.max_score)}` : "—"}</p>
          {result ? <p className="text-xs text-muted-foreground">{Number(result.percentage)}%{result.passed === null ? "" : result.passed ? " · Pass" : " · Below pass mark"}</p> : null}
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle"><T>MCQ (auto)</T></p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? Number(result.mcq_score) : "—"}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle"><T>Written (final)</T></p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{result ? Number(result.cq_score) : "—"}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle"><T>Integrity signals</T></p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{hidden}</p>
          <p className="text-xs text-muted-foreground">
            tab left · {offline} offline · best-effort only
          </p>
        </div>
      </div>
      {attempt.extended_at ? (
        <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          {t("Extra time given {when}", { when: f.dateTime(attempt.extended_at, tz) })}
          {attempt.extension_note ? ` · ${attempt.extension_note}` : ""}
        </p>
      ) : null}
      {attempt.status === "returned" && attempt.return_note ? (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          {t("Returned with note: {note} (due {when})", { note: attempt.return_note, when: f.dateTime(attempt.resubmit_deadline_at, tz) })}
        </p>
      ) : null}
      <GradingWorkspace data={data} />
    </>
  );
}

export default function TeacherAttemptPage({ params }: PageProps<"/[lang]/teacher/attempts/[attemptId]">) {
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
