import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Hourglass, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils/cn";
import { uuid } from "@/lib/validations/courses";
import { getStudentResult } from "@/features/attempts/result-queries";
import { STUDENT_RELEASE_LABEL } from "@/features/exams/status";
import { AnnotatedFile } from "@/features/grading/components/annotated-file";
import { hasBengali, optionLabel } from "@/lib/utils/bangla";
import { T } from "@/lib/i18n/client";

async function Result({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!uuid.safeParse(attemptId).success) notFound();
  const { profile, supabase } = await requireStudent();
  const data = await getStudentResult(supabase, attemptId, profile.id);
  if (!data) notFound();
  const { attempt, exam, result, questions, annotations, keysReleased } = data;
  const tz = profile.timezone;
  const crumbs = [{ label: "Results", href: "/student/results" }, { label: exam.title }];

  if (attempt.status === "in_progress") {
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title={exam.title} />
        <Button asChild>
          <Link href={`/student/attempts/${attempt.id}`}><T>Return to your exam</T></Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={exam.title}
        description={`${exam.course?.title ?? ""} · Attempt ${attempt.attempt_number} · Submitted ${formatDateTime(attempt.submitted_at, tz)}${attempt.submitted_via === "timeout" ? " automatically when time ran out" : ""}`}
      />

      {attempt.status === "returned" ? (
        <div role="note" className="mb-6 rounded-md border bg-warning-soft p-4 text-sm text-warning-soft-foreground">
          <p className="font-medium"><T>Your teacher returned this attempt for correction.</T></p>
          {attempt.return_note ? <p className="mt-1 whitespace-pre-wrap">{attempt.return_note}</p> : null}
          {attempt.resubmit_deadline_at && new Date(attempt.resubmit_deadline_at).getTime() > requestTime() ? (
            <Button asChild size="sm" className="mt-3">
              <Link href={`/student/attempts/${attempt.id}`}>Upload corrections (due {formatDateTime(attempt.resubmit_deadline_at, tz)})</Link>
            </Button>
          ) : (
            <p className="mt-1"><T>The resubmission deadline has passed.</T></p>
          )}
        </div>
      ) : null}

      {!result ? (
        <div className="surface flex flex-col items-center gap-2 p-8 text-center">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <h2 className="section-title"><T>Your answers were submitted</T></h2>
          <p className="text-subtle max-w-md">
            {exam.exam_type !== "mcq" ? "Written answers need to be graded by your teacher. " : ""}
            Results will be released {STUDENT_RELEASE_LABEL[exam.results_release]}.
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Hourglass className="size-3.5" aria-hidden /> <T>Check back later.</T>
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="surface p-4">
              <p className="text-subtle"><T>Your score</T></p>
              <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums">
                {Number(result.total_score)}
                <span className="text-sm text-muted-foreground"> / {Number(result.max_score)}</span>
              </p>
              <p className="text-xs text-muted-foreground">{Number(result.percentage)}%</p>
            </div>
            <div className="surface p-5">
              <p className="text-subtle"><T>Breakdown</T></p>
              <p className="mt-2 text-sm">
                <T>MCQ:</T> <span className="font-semibold tabular-nums">{Number(result.mcq_score)}</span>
              </p>
              <p className="text-sm">
                <T>Written:</T> <span className="font-semibold tabular-nums">{Number(result.cq_score)}</span>
              </p>
            </div>
            <div className="surface p-5">
              <p className="text-subtle"><T>Outcome</T></p>
              {result.passed === null ? (
                <p className="mt-2 text-sm text-muted-foreground"><T>No pass mark set.</T></p>
              ) : (
                <p className={cn("mt-2 flex items-center gap-2 text-lg font-semibold", result.passed ? "text-success" : "text-danger")}>
                  {result.passed ? <CheckCircle2 className="size-5" aria-hidden /> : <XCircle className="size-5" aria-hidden />}
                  {result.passed ? "Passed" : "Not passed"}
                </p>
              )}
              {exam.pass_marks !== null ? <p className="text-xs text-muted-foreground">Pass mark {Number(exam.pass_marks)}</p> : null}
            </div>
          </div>
          {!keysReleased && exam.exam_type !== "cq" ? (
            <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              {exam.reveal_answers
                ? "Marks for each MCQ and the correct answers will be shown after the exam closes for everyone."
                : "Your teacher doesn't show marks for each MCQ or the correct answers for this exam."}
            </p>
          ) : null}
        </>
      )}

      {result ? (
        <ol className="space-y-4">
          {questions.map((q, i) => {
            const total = q.grades.reduce((s, g) => s + g.marks_awarded, 0);
            return (
              <li key={q.id} className="surface p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Question {i + 1}</h3>
                  {q.type === "mcq" && q.grades.length === 0 ? (
                    // Per-question MCQ marks reveal the answer, so they wait for the window to close.
                    <Badge>— / {q.marks}</Badge>
                  ) : (
                    <Badge tone={total > 0 ? "success" : total < 0 ? "danger" : "neutral"}>
                      {total} / {q.marks}
                    </Badge>
                  )}
                </div>
                <p className="prose-text">{q.body}</p>
                {q.type === "mcq" ? (
                  <div className="mt-3 space-y-1.5">
                    {q.options.map((o, oi) => {
                      const chosen = q.answer?.selected_option_id === o.id;
                      const correct = q.key?.correct_option_id === o.id;
                      return (
                        <div key={o.id} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", correct && "border-success bg-success-soft", chosen && keysReleased && !correct && "border-danger bg-danger-soft", chosen && !keysReleased && "border-primary bg-primary-soft/60")}>
                          <span className="font-medium">{optionLabel(oi, hasBengali(q.body, ...q.options.map((x) => x.body)))}.</span>
                          <span className="flex-1">{o.body}</span>
                          {chosen ? <Badge><T>Your answer</T></Badge> : null}
                          {correct ? <Badge tone="success"><T>Correct</T></Badge> : null}
                        </div>
                      );
                    })}
                    {!q.answer?.selected_option_id ? <p className="text-sm text-muted-foreground"><T>Not answered.</T></p> : null}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {q.answer?.text_answer ? <p className="prose-text rounded-md bg-muted p-3 text-sm">{q.answer.text_answer}</p> : null}
                    {q.files.map((f) => (
                      <AnnotatedFile key={f.id} attemptId={attempt.id} file={f} annotations={annotations.filter((a) => a.answer_file_id === f.id)} editable={false} />
                    ))}
                  </div>
                )}
                {q.grades.filter((g) => g.feedback).length ? (
                  <div className="mt-3 space-y-1 rounded-md border-l-4 border-primary bg-primary-soft/40 px-3 py-2 text-sm">
                    {q.grades
                      .filter((g) => g.feedback)
                      .map((g) => (
                        <p key={`${g.part_id ?? "q"}`}>
                          {g.part_id ? <span className="font-medium">({q.parts.find((p) => p.id === g.part_id)?.label}) </span> : null}
                          {g.feedback}
                        </p>
                      ))}
                  </div>
                ) : null}
                {q.key?.explanation || q.key?.model_answer ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium"><T>Explanation</T></summary>
                    {q.key.explanation ? <p className="prose-text mt-2">{q.key.explanation}</p> : null}
                    {q.key.model_answer ? <p className="prose-text mt-2 text-muted-foreground">{q.key.model_answer}</p> : null}
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </>
  );
}

export default function StudentResultPage({ params }: PageProps<"/student/attempts/[attemptId]/result">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <Result params={params} />
    </Suspense>
  );
}
