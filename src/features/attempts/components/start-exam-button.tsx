"use client";

import * as React from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import { startAttemptAction } from "../actions";
import { MinutesText, T } from "@/lib/i18n/client";

export function StartExamButton({
  examId,
  durationMinutes,
  mcqMinutes = null,
  minutesUntilClose,
}: {
  examId: string;
  durationMinutes: number;
  /** Separately timed MCQ section (mixed exams). */
  mcqMinutes?: number | null;
  minutesUntilClose: number;
}) {
  const [agreed, setAgreed] = React.useState(false);
  const { run, pending } = useServerAction(startAttemptAction);
  const effective = Math.min(durationMinutes, Math.max(0, Math.floor(minutesUntilClose)));
  const mcqEffective = mcqMinutes ? Math.min(mcqMinutes, effective) : null;
  return (
    <Dialog onOpenChange={() => setAgreed(false)}>
      <DialogTrigger asChild>
        <Button size="lg">
          <PlayCircle aria-hidden /> <T>Start exam</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle><T>Ready to start?</T></DialogTitle>
          <DialogDescription>
            The timer starts on the server as soon as you begin and keeps running even if you close this page. You&apos;ll have{" "}
            <strong><MinutesText minutes={effective} /></strong>
            {effective < durationMinutes ? " because the exam window closes soon" : ""}.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {mcqEffective ? (
            <li>
              <strong className="text-foreground">MCQs come first, with <MinutesText minutes={mcqEffective} />.</strong> <T>When that time is up (or you finish early) your MCQ
              answers lock and the written questions open.</T>
            </li>
          ) : null}
          <li><T>Answers save automatically. Keep an eye on the save indicator.</T></li>
          <li><T>When time runs out, your saved answers are submitted automatically.</T></li>
          <li><T>Leaving the exam tab is recorded for your teacher.</T></li>
        </ul>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> <T>I&apos;ve read the instructions</T>
        </label>
        <DialogFooter>
          <Button pending={pending} disabled={!agreed} onClick={() => run(examId)}>
            <T>Begin now</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
