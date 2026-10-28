"use client";

import * as React from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import { formatMinutes } from "@/lib/utils/datetime";
import { startAttemptAction } from "../actions";

export function StartExamButton({ examId, durationMinutes, minutesUntilClose }: { examId: string; durationMinutes: number; minutesUntilClose: number }) {
  const [agreed, setAgreed] = React.useState(false);
  const { run, pending } = useServerAction(startAttemptAction);
  const effective = Math.min(durationMinutes, Math.max(0, Math.floor(minutesUntilClose)));
  return (
    <Dialog onOpenChange={() => setAgreed(false)}>
      <DialogTrigger asChild>
        <Button size="lg">
          <PlayCircle aria-hidden /> Start exam
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Ready to start?</DialogTitle>
          <DialogDescription>
            The timer starts on the server as soon as you begin and keeps running even if you close this page. You&apos;ll have{" "}
            <strong>{formatMinutes(effective)}</strong>
            {effective < durationMinutes ? " because the exam window closes soon" : ""}.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Answers save automatically. Keep an eye on the save indicator.</li>
          <li>When time runs out, your saved answers are submitted automatically.</li>
          <li>Leaving the exam tab is recorded for your teacher.</li>
        </ul>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I&apos;ve read the instructions
        </label>
        <DialogFooter>
          <Button pending={pending} disabled={!agreed} onClick={() => run(examId)}>
            Begin now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
