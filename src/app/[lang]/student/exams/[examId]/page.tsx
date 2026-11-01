import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, ListChecks, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { EXAM_TYPE_LABEL, PHASE_META, STUDENT_RELEASE_LABEL, examPhase } from "@/features/exams/status";
import { StartExamButton } from "@/features/attempts/components/start-exam-button";
import { DateTimeText, MinutesText, T } from "@/lib/i18n/client";
import { getFormatters, getRouteT } from "@/lib/i18n/route";

async function ExamOverview({ params }: { params: Promise<{ examId: string }> }) {
  const [t, f] = await Promise.all([getRouteT(), getFormatters()]);
  const { examId } = await params;
  if (!uuid.safeParse(examId).success) notFound();
  const { profile, supabase } = await requireStudent();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, description, instructions, exam_type, status, starts_at, ends_at, duration_minutes, mcq_duration_minutes, total_marks, pass_marks, max_attempts, results_release, course:courses(id, title)")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) notFound();
  const [{ data: overview }, { data: attempts }, { data: lateWindows }] = await Promise.all([
    supabase.rpc("get_exam_overview", { p_exam_id: exam.id }),
    supabase.from("exam_attempts").select("id, attempt_number, status, submitted_at").eq("exam_id", exam.id).eq("student_id", profile.id).order("attempt_number"),
    supabase.rpc("my_late_window", { p_exam_id: exam.id }),
  ]);
  const info = overview?.[0];
  const now = info ? new Date(info.server_now).getTime() : requestTime();
  const phase = examPhase(exam, now);
  const meta = PHASE_META[phase];
  const tz = profile.timezone;
  const used = info?.attempts_used ?? 0;
  // A teacher-granted personal window for a late attempt (exam ended, missed, or attempts used up).
  const late = lateWindows?.[0] ?? null;
  const lateOpen = Boolean(late && new Date(late.starts_at).getTime() <= now);
  const normalStart = phase === "live" && used < exam.max_attempts;
  const canStart = (normalStart || lateOpen) && !info?.open_attempt_id;
  const closesAt = !normalStart && late ? late.ends_at : exam.ends_at;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/student/exams" }, { label: exam.title }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {exam.title} <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        }
        description={exam.course?.title}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle><T>Instructions</T></CardTitle>
          </CardHeader>
          <CardContent>
            {exam.description ? <p className="prose-text mb-4">{exam.description}</p> : null}
            <p className="prose-text text-sm">{exam.instructions || "No special instructions."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-5 text-sm">
            <p className="flex items-center gap-2">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden />
              {EXAM_TYPE_LABEL[exam.exam_type]} · {info?.question_count ?? "—"} questions · {Number(exam.total_marks)} marks
              {exam.pass_marks !== null ? ` (pass ${Number(exam.pass_marks)})` : ""}
            </p>
            <p className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <MinutesText minutes={exam.duration_minutes} />
            </p>
            {exam.mcq_duration_minutes ? (
              <p className="-mt-1 ml-6 text-xs text-muted-foreground">
                {t("MCQ section first: {time}. MCQ answers lock when it ends, then the written part gets the rest of the time.", { time: f.minutes(exam.mcq_duration_minutes) })}
              </p>
            ) : null}
            <p className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <span>
                <DateTimeText iso={exam.starts_at} timeZone={tz} /> – <DateTimeText iso={exam.ends_at} timeZone={tz} withZone />
              </span>
            </p>
            <p className="flex items-center gap-2">
              <RotateCcw className="size-4 text-muted-foreground" aria-hidden />
              {t("Attempts used {used} of {max}", { used, max: exam.max_attempts })}
            </p>
            <p className="text-xs text-muted-foreground">{t("Results: {release}.", { release: t(STUDENT_RELEASE_LABEL[exam.results_release]) })}</p>
            {late && !info?.open_attempt_id ? (
              <div role="note" className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
                <p className="font-medium">{t("Your teacher allowed you a late attempt")}</p>
                <p className="mt-0.5">
                  {f.dateTime(late.starts_at, tz)} – {f.dateTime(late.ends_at, tz, { withZone: true })}
                  {late.note ? ` · ${late.note}` : ""}
                </p>
              </div>
            ) : null}
            <div className="pt-2">
              {info?.open_attempt_id ? (
                <Button asChild size="lg" className="w-full">
                  <Link href={`/student/attempts/${info.open_attempt_id}`}><T>Resume exam</T></Link>
                </Button>
              ) : canStart ? (
                <StartExamButton
                  examId={exam.id}
                  durationMinutes={exam.duration_minutes}
                  mcqMinutes={exam.mcq_duration_minutes}
                  minutesUntilClose={(new Date(closesAt).getTime() - now) / 60000} />
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
                  {late && !lateOpen
                    ? t("Opens {when}", { when: f.dateTime(late.starts_at, tz) })
                    : phase === "scheduled"
                      ? t("Opens {when}", { when: f.dateTime(exam.starts_at, tz) })
                      : phase === "live"
                        ? t("You've used all your attempts.")
                        : t("This exam has ended.")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {attempts?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle><T>Your attempts</T></CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    Attempt {a.attempt_number} · {a.status === "in_progress" ? "In progress" : t("Submitted {when}", { when: f.dateTime(a.submitted_at, tz) })}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={a.status === "in_progress" ? `/student/attempts/${a.id}` : `/student/attempts/${a.id}/result`}>
                      {a.status === "in_progress" ? "Resume" : a.status === "returned" ? "Corrections needed" : "View"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export default function StudentExamPage({ params }: PageProps<"/[lang]/student/exams/[examId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <ExamOverview params={params} />
    </Suspense>
  );
}
