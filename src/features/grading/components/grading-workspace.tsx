"use client";

import * as React from "react";
import { CheckCircle2, CircleSlash, Lock, LockOpen, Undo2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useServerAction } from "@/components/forms/use-server-action";
import { cn } from "@/lib/utils/cn";
import { attemptGradingAction, returnAttemptAction, saveGradeAction } from "../actions";
import { ReopenAttemptDialog } from "./extra-time";
import type { Annotation, GradingData, GradingQuestion } from "../queries";
import { AnnotatedFile } from "./annotated-file";
import { hasBengali, optionLabel } from "@/lib/utils/bangla";
import { T, tNow } from "@/lib/i18n/client";

type Grade = GradingData["grades"][number];

function GradeItem({
  attemptId,
  question,
  partId,
  label,
  max,
  grade,
  disabled,
}: {
  attemptId: string;
  question: GradingQuestion;
  partId: string | null;
  label: string;
  max: number;
  grade?: Grade;
  disabled: boolean;
}) {
  const [marks, setMarks] = React.useState(grade ? String(grade.marks_awarded) : "");
  const [feedback, setFeedback] = React.useState(grade?.feedback ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useServerAction(saveGradeAction);
  const dirty = marks !== (grade ? String(grade.marks_awarded) : "") || feedback !== (grade?.feedback ?? "");
  const id = `grade-${question.id}-${partId ?? "q"}`;

  return (
    <form
      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = Number(marks);
        if (marks === "" || Number.isNaN(value) || value < 0 || value > max) {
          setError(tNow("Enter marks between 0 and {v0}.", { v0: max }));
          return;
        }
        setError(null);
        await run({ attemptId, questionId: question.id, partId, marks: value, feedback });
      }}
    >
      <Field id={`${id}-marks`} label={`${label} (out of ${max})`} error={error ?? undefined}>
        {(a) => <Input type="number" step="0.25" min={0} max={max} inputMode="decimal" placeholder={`0–${max}`} value={marks} disabled={disabled} onChange={(e) => setMarks(e.target.value)} {...a} />}
      </Field>
      <Field id={`${id}-feedback`} label="Feedback for the student">
        {(a) => <Input value={feedback} placeholder="e.g. Good diagram; explain the second step" disabled={disabled} maxLength={5000} onChange={(e) => setFeedback(e.target.value)} {...a} />}
      </Field>
      <div className="flex items-center gap-2">
        {grade ? <Badge tone={grade.status === "final" ? "success" : "info"}>{grade.status === "final" ? "Final" : "Draft"}</Badge> : <Badge tone="warning"><T>Ungraded</T></Badge>}
        <Button type="submit" size="sm" pending={pending} disabled={disabled || !dirty}>
          <T>Save</T>
        </Button>
      </div>
    </form>
  );
}

function ReturnDialog({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const { run, pending } = useServerAction(returnAttemptAction);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 aria-hidden /> <T>Return for correction</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle><T>Return written work</T></DialogTitle>
          <DialogDescription>The student can upload corrected answer sheets until the deadline, then resubmit. Written marks become drafts again; MCQ answers stay locked.</DialogDescription>
        </DialogHeader>
        <Field id="return-note" label="Note to the student">
          {(a) => <Textarea rows={3} value={note} placeholder="What should the student correct?" onChange={(e) => setNote(e.target.value)} maxLength={2000} {...a} />}
        </Field>
        <Field id="return-deadline" label="Resubmission deadline" required>
          {(a) => <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} {...a} />}
        </Field>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!deadline}
            onClick={async () => {
              const r = await run({ attemptId, note, deadline });
              if (r?.ok) setOpen(false);
            }}
          >
            Return work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GradingWorkspace({ data }: { data: GradingData }) {
  const { attempt, result, questions, answers, files, grades, annotations } = data;
  const action = useServerAction(attemptGradingAction);
  const finalized = result?.grading_status === "graded";
  const submitted = attempt.status === "submitted";
  const gradeFor = (qid: string, pid: string | null) => grades.find((g) => g.question_id === qid && g.part_id === pid && !g.is_auto);
  const cqItems = questions.filter((q) => q.type === "cq").flatMap((q) => (q.parts.length ? q.parts.map((p) => gradeFor(q.id, p.id)) : [gradeFor(q.id, null)]));
  const graded = cqItems.filter(Boolean).length;
  const annotationsFor = (fileId: string): Annotation[] => annotations.filter((a) => a.answer_file_id === fileId);

  return (
    <div className="space-y-6">
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {cqItems.length ? (
            <p>
              <T>Written items graded:</T> <span className="font-semibold tabular-nums">{graded}</span>/{cqItems.length}
            </p>
          ) : (
            <p><T>MCQ-only exam — graded automatically.</T></p>
          )}
          {!submitted ? <p className="text-muted-foreground"><T>Grading opens once the attempt is submitted.</T></p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {submitted ? <ReopenAttemptDialog attemptId={attempt.id} answersMayBeOut={data.answersMayBeOut} /> : null}
          {submitted && data.attempt.exam?.allow_resubmission && cqItems.length ? <ReturnDialog attemptId={attempt.id} /> : null}
          {finalized ? (
            cqItems.length ? (
              <ConfirmDialog
                title="Reopen grading?"
                description="Written marks become drafts again and students stop seeing this result until you finalize."
                confirmLabel="Reopen"
                onConfirm={async () => (await action.run(attempt.id, "reopen"))?.ok ?? false}
                trigger={
                  <Button variant="outline">
                    <LockOpen aria-hidden /> <T>Reopen grading</T>
                  </Button>
                }
              />
            ) : null
          ) : (
            <ConfirmDialog
              title="Finalize grading?"
              description="All marks become final. Students see the result according to the exam's release setting."
              confirmLabel="Finalize"
              onConfirm={async () => (await action.run(attempt.id, "finalize"))?.ok ?? false}
              trigger={
                <Button disabled={!submitted || graded < cqItems.length}>
                  <Lock aria-hidden /> <T>Finalize grading</T>
                </Button>
              }
            />
          )}
        </div>
      </div>

      <ol className="space-y-4">
        {questions.map((q, i) => {
          const answer = answers.find((a) => a.question_id === q.id);
          const auto = grades.find((g) => g.question_id === q.id && g.is_auto);
          const qFiles = files.filter((f) => f.questionId === q.id);
          return (
            <li key={q.id} className="surface p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Question {i + 1}</h3>
                <Badge tone={q.type === "mcq" ? "primary" : "info"}>{q.type === "mcq" ? "MCQ" : "Written"}</Badge>
                <Badge>{q.marks} marks</Badge>
                {q.studentPosition !== null && q.studentPosition !== i ? <span className="text-xs text-muted-foreground">Shown to student as Q{q.studentPosition + 1}</span> : null}
                {answer?.marked_for_review ? <Badge tone="warning"><T>Student marked for review</T></Badge> : null}
              </div>
              <p className="prose-text">{q.body}</p>
              {q.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                <img src={q.imageUrl} alt="" className="mt-3 max-h-56 rounded-md border" />
              ) : null}

              {q.type === "mcq" ? (
                <div className="mt-4 space-y-1.5">
                  {q.options.map((o, oi) => {
                    const chosen = answer?.selected_option_id === o.id;
                    const correct = q.correctOptionId === o.id;
                    return (
                      <div
                        key={o.id}
                        className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", correct && "border-success bg-success-soft", chosen && !correct && "border-danger bg-danger-soft")}
                      >
                        <span className="font-medium">{optionLabel(oi, hasBengali(q.body, ...q.options.map((x) => x.body)))}.</span>
                        <span className="flex-1">{o.body}</span>
                        {chosen ? <Badge tone={correct ? "success" : "danger"}><T>Student&apos;s answer</T></Badge> : null}
                        {correct ? <CheckCircle2 className="size-4 text-success" aria-label="Correct answer" /> : null}
                      </div>
                    );
                  })}
                  <p className="pt-1 text-sm">
                    {answer?.selected_option_id ? null : (
                      <span className="mr-2 inline-flex items-center gap-1 text-muted-foreground">
                        <CircleSlash className="size-4" aria-hidden /> <T>Not answered.</T>
                      </span>
                    )}
                    Auto-graded:{" "}
                    <span className={cn("font-semibold tabular-nums", (auto?.marks_awarded ?? 0) < 0 && "text-danger")}>
                      {auto ? auto.marks_awarded : submitted ? 0 : "—"}
                    </span>{" "}
                    / {q.marks}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {q.parts.length ? (
                    <ol className="space-y-1 text-sm">
                      {q.parts.map((p) => (
                        <li key={p.id}>
                          <span className="font-medium">({p.label})</span> {p.body} <span className="text-muted-foreground">[{p.marks}]</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {q.rubric || q.modelAnswer ? (
                    <details className="rounded-md border border-dashed p-3 text-sm">
                      <summary className="cursor-pointer font-medium"><T>Model answer and rubric (private)</T></summary>
                      {q.modelAnswer ? <p className="prose-text mt-2">{q.modelAnswer}</p> : null}
                      {q.rubric ? <p className="prose-text mt-2 text-muted-foreground">{q.rubric}</p> : null}
                    </details>
                  ) : null}
                  {answer?.text_answer ? (
                    <div>
                      <p className="mb-1 text-sm font-medium"><T>Typed answer</T></p>
                      <p className="prose-text rounded-md bg-muted p-3 text-sm">{answer.text_answer}</p>
                    </div>
                  ) : null}
                  {qFiles.length ? (
                    <div className="space-y-6">
                      {qFiles.map((f) => (
                        <div key={f.id}>
                          {f.partId ? <p className="mb-1 text-xs text-muted-foreground">For part ({q.parts.find((p) => p.id === f.partId)?.label})</p> : null}
                          <AnnotatedFile attemptId={attempt.id} file={f} annotations={annotationsFor(f.id)} editable={submitted && !finalized} />
                        </div>
                      ))}
                    </div>
                  ) : !answer?.text_answer ? (
                    <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <XCircle className="size-4" aria-hidden /> <T>No answer submitted.</T>
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {q.parts.length ? (
                      q.parts.map((p) => (
                        <GradeItem
                          key={`${p.id}-${gradeFor(q.id, p.id)?.marks_awarded ?? ""}`}
                          attemptId={attempt.id}
                          question={q}
                          partId={p.id}
                          label={`Part (${p.label})`}
                          max={p.marks}
                          grade={gradeFor(q.id, p.id)}
                          disabled={!submitted || finalized}
                        />
                      ))
                    ) : (
                      <GradeItem
                        key={`${q.id}-${gradeFor(q.id, null)?.marks_awarded ?? ""}`}
                        attemptId={attempt.id}
                        question={q}
                        partId={null}
                        label="Marks"
                        max={q.marks}
                        grade={gradeFor(q.id, null)}
                        disabled={!submitted || finalized}
                      />
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
