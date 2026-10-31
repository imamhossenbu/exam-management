"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CheckCircle2, Copy, FileUp, KeyRound, ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerAction } from "@/components/forms/use-server-action";
import { cn } from "@/lib/utils/cn";
import type { Enums } from "@/types/database";
import { correctAnswerKeyAction, deleteQuestionAction, duplicateQuestionAction, reorderQuestionsAction } from "../actions";
import type { BuilderQuestion } from "../queries";
import { QuestionEditorDialog } from "./question-editor-dialog";
import { hasBengali, optionLabel } from "@/lib/utils/bangla";
import { T } from "@/lib/i18n/client";

function CorrectKeyDialog({ question }: { question: BuilderQuestion }) {
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState(question.correctIndex);
  const { run, pending } = useServerAction(correctAnswerKeyAction);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && (setOpen(o), setChoice(question.correctIndex))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <KeyRound aria-hidden /> <T>Correct key</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle><T>Correct the answer key</T></DialogTitle>
          <DialogDescription><T>Every submitted attempt is regraded for this question. The change is recorded in the audit log.</T></DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only"><T>Correct option</T></legend>
          {question.options.map((o, i) => (
            <label key={o.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input type="radio" name={`key-${question.id}`} className="accent-primary" checked={choice === i} onChange={() => setChoice(i)} />
              <span className="font-medium">{optionLabel(i, hasBengali(question.body, ...question.options.map((x) => x.body)))}.</span> {o.body}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={choice === question.correctIndex || choice < 0}
            onClick={async () => {
              const r = await run(question.id, question.options[choice].id);
              if (r?.ok) setOpen(false);
            }}
          >
            Save and regrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionCard({
  q,
  index,
  total,
  examId,
  examType,
  editable,
  published,
  onMove,
  moving,
}: {
  q: BuilderQuestion;
  index: number;
  total: number;
  examId: string;
  examType: Enums<"exam_type">;
  editable: boolean;
  published: boolean;
  onMove: (from: number, to: number) => void;
  moving: boolean;
}) {
  const del = useServerAction(deleteQuestionAction);
  const dup = useServerAction(duplicateQuestionAction);
  return (
    <li className="surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Q{index + 1}</span>
            <Badge tone={q.type === "mcq" ? "primary" : "info"}>{q.type === "mcq" ? "MCQ" : "Written"}</Badge>
            <Badge>
              {q.marks} mark{q.marks === 1 ? "" : "s"}
            </Badge>
            {q.negativeMarks > 0 ? <Badge tone="danger">−{q.negativeMarks} if wrong</Badge> : null}
            {q.type === "mcq" && q.correctIndex < 0 ? <Badge tone="warning"><T>No correct option</T></Badge> : null}
          </div>
          <p className="prose-text">{q.body}</p>
          {q.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={q.imageUrl} alt={`Attachment for question ${index + 1}`} className="mt-3 max-h-56 rounded-md border" />
          ) : null}
          {q.type === "mcq" ? (
            <ol className="mt-3 grid gap-1 sm:grid-cols-2">
              {q.options.map((o, i) => (
                <li key={o.id} className={cn("flex items-start gap-2 rounded-md px-2 py-1 text-sm", i === q.correctIndex && "bg-success-soft text-success-soft-foreground")}>
                  <span className="font-medium">{optionLabel(i, hasBengali(q.body, ...q.options.map((x) => x.body)))}.</span>
                  <span className="flex-1">{o.body}</span>
                  {i === q.correctIndex ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Correct answer" /> : null}
                </li>
              ))}
            </ol>
          ) : q.parts.length ? (
            <ol className="mt-3 space-y-1 text-sm">
              {q.parts.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">({p.label})</span> {p.body} <span className="text-muted-foreground">— {p.marks}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {q.explanation ? <p className="mt-3 text-xs text-muted-foreground">Explanation: {q.explanation}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {editable ? (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={`Move question ${index + 1} up`} disabled={index === 0 || moving} onClick={() => onMove(index, index - 1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move question ${index + 1} down`} disabled={index === total - 1 || moving} onClick={() => onMove(index, index + 1)}>
                <ArrowDown />
              </Button>
              <QuestionEditorDialog
                examId={examId}
                examType={examType}
                question={q}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit question ${index + 1}`}>
                    <Pencil />
                  </Button>
                }
              />
              <Button variant="ghost" size="icon-sm" aria-label={`Duplicate question ${index + 1}`} disabled={dup.pending} onClick={() => dup.run(q.id)}>
                <Copy />
              </Button>
              <ConfirmDialog
                title={`Delete question ${index + 1}?`}
                description="This can't be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => (await del.run(q.id))?.ok ?? false}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete question ${index + 1}`}>
                    <Trash2 />
                  </Button>
                }
              />
            </>
          ) : published && q.type === "mcq" ? (
            <CorrectKeyDialog question={q} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function QuestionBuilder({
  examId,
  examType,
  totalMarks,
  questions,
  editable,
  published,
}: {
  examId: string;
  examType: Enums<"exam_type">;
  totalMarks: number;
  questions: BuilderQuestion[];
  editable: boolean;
  published: boolean;
}) {
  const [order, setOrder] = React.useState(questions);
  const [source, setSource] = React.useState(questions);
  // Reset the optimistic order whenever fresh server data arrives (render-time adjustment, no effect).
  if (source !== questions) {
    setSource(questions);
    setOrder(questions);
  }
  const reorder = useServerAction(reorderQuestionsAction);
  const sum = order.reduce((s, q) => s + q.marks, 0);
  const balanced = Math.abs(sum - totalMarks) < 0.001;

  function move(from: number, to: number) {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    reorder.run(examId, next.map((q) => q.id)).then((r) => {
      if (!r?.ok) setOrder(questions);
    });
  }

  const addButton = (
    <QuestionEditorDialog
      examId={examId}
      examType={examType}
      trigger={
        <Button>
          <Plus aria-hidden /> <T>Add question</T>
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{order.length}</span> question{order.length === 1 ? "" : "s"} ·{" "}
            <span className={cn("font-semibold tabular-nums", balanced ? "text-success" : "text-warning")}>
              {sum} / {totalMarks}
            </span>{" "}
            marks allocated
          </p>
          {!balanced && editable ? (
            <p className="text-xs text-muted-foreground">
              {sum < totalMarks ? `Add ${totalMarks - sum} more mark(s)` : `Remove ${sum - totalMarks} mark(s)`}, or change the exam total, before publishing.
            </p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/teacher/exams/${examId}/import`}>
                <FileUp aria-hidden /> <T>Import from PDF/image</T>
              </Link>
            </Button>
            {addButton}
          </div>
        ) : null}
      </div>
      {order.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="No questions yet"
          description="Write questions directly, or import them from a PDF or photo and review them before saving."
          action={editable ? addButton : undefined}
        />
      ) : (
        <ol className="space-y-3" aria-label="Questions">
          {order.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              total={order.length}
              examId={examId}
              examType={examType}
              editable={editable}
              published={published}
              onMove={move}
              moving={reorder.pending}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
