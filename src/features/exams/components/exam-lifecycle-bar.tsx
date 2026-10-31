"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, Lock, Rocket, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import type { ExamPhase } from "../status";
import { deleteExamAction, duplicateExamAction, examLifecycleAction, publishExamAction } from "../actions";
import { T } from "@/lib/i18n/client";

export function ExamLifecycleBar({
  examId,
  phase,
  attemptCount,
  openAttemptCount,
  resultsPublished,
}: {
  examId: string;
  phase: ExamPhase;
  attemptCount: number;
  openAttemptCount: number;
  resultsPublished: boolean;
}) {
  const [problems, setProblems] = React.useState<string[] | null>(null);
  const publish = useServerAction(publishExamAction, { onSuccess: (d) => d.problems.length && setProblems(d.problems) });
  const lifecycle = useServerAction(examLifecycleAction);
  const duplicate = useServerAction(duplicateExamAction);
  const remove = useServerAction(deleteExamAction);
  const run = async (op: Parameters<typeof examLifecycleAction>[1]) => (await lifecycle.run(examId, op))?.ok ?? false;

  return (
    <>
      {phase === "draft" ? (
        <>
          <ConfirmDialog
            title="Delete this draft?"
            description="The exam and its questions are permanently deleted."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => (await remove.run(examId))?.ok ?? false}
            trigger={
              <Button variant="ghost">
                <Trash2 aria-hidden /> <T>Delete</T>
              </Button>
            }
          />
          <ConfirmDialog
            title="Publish this exam?"
            description="Enrolled students will see it and can start when the window opens. Questions and scoring settings are locked once published."
            confirmLabel="Publish"
            onConfirm={async () => {
              const r = await publish.run(examId);
              return Boolean(r?.ok);
            }}
            trigger={
              <Button>
                <Rocket aria-hidden /> <T>Publish</T>
              </Button>
            }
          />
        </>
      ) : null}

      {(phase === "scheduled" || phase === "live") && attemptCount === 0 ? (
        <ConfirmDialog
          title="Move back to draft?"
          description="Students won't see the exam until you publish it again."
          confirmLabel="Unpublish"
          onConfirm={() => run("unpublish")}
          trigger={
            <Button variant="outline">
              <Undo2 aria-hidden /> <T>Unpublish</T>
            </Button>
          }
        />
      ) : null}

      {phase === "scheduled" || phase === "live" || phase === "ended" ? (
        <ConfirmDialog
          title="Close the exam now?"
          description={
            openAttemptCount > 0
              ? <T vars={{ n: openAttemptCount }}>{"{n} attempt(s) in progress will be submitted immediately with their saved answers. No new attempts can start."}</T>
              : "No new attempts can start."
          }
          confirmLabel="Close exam"
          destructive
          onConfirm={() => run("close")}
          trigger={
            <Button variant="outline">
              <Lock aria-hidden /> <T>Close</T>
            </Button>
          }
        />
      ) : null}

      {phase !== "draft" ? (
        resultsPublished ? (
          <Button variant="outline" pending={lifecycle.pending} onClick={() => run("unpublishResults")}>
            <EyeOff aria-hidden /> <T>Hide results</T>
          </Button>
        ) : (
          <ConfirmDialog
            title="Publish results?"
            description="Students can see scores for fully graded attempts. Correct answers are only shown after the exam window closes, if enabled."
            confirmLabel="Publish results"
            onConfirm={() => run("publishResults")}
            trigger={
              <Button variant="outline">
                <Eye aria-hidden /> <T>Publish results</T>
              </Button>
            }
          />
        )
      ) : null}

      {phase === "ended" || phase === "closed" ? (
        <ConfirmDialog
          title="Archive this exam?"
          description="It's hidden from active lists. Attempts and results are kept and can be restored."
          confirmLabel="Archive"
          onConfirm={() => run("archive")}
          trigger={
            <Button variant="ghost">
              <Archive aria-hidden /> <T>Archive</T>
            </Button>
          }
        />
      ) : null}
      {phase === "archived" ? (
        <Button variant="outline" pending={lifecycle.pending} onClick={() => run("restore")}>
          <ArchiveRestore aria-hidden /> <T>Restore</T>
        </Button>
      ) : null}

      <Button variant="outline" pending={duplicate.pending} onClick={() => duplicate.run(examId)}>
        <Copy aria-hidden /> <T>Duplicate</T>
      </Button>

      <Dialog open={problems !== null} onOpenChange={(o) => !o && setProblems(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><T>Not ready to publish</T></DialogTitle>
            <DialogDescription><T>Fix these issues, then publish again.</T></DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {problems?.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setProblems(null)}><T>OK</T></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
