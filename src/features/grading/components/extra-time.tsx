"use client";

import * as React from "react";
import { AlertTriangle, CalendarPlus, TimerReset, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useServerAction } from "@/components/forms/use-server-action";
import { DateTimeText, T, useT } from "@/lib/i18n/client";
import { utcToZonedInput } from "@/lib/utils/datetime";
import { grantLateStartAction, reopenAttemptAction, revokeExtensionAction } from "../actions";

/** Shown when other students may already have seen results or correct answers. */
function FairnessWarning() {
  return (
    <p role="note" className="flex gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <T>Correct answers or results for this exam may already be visible to other students, so this student could have heard them. Correct answers stay hidden again until the extra time ends.</T>
    </p>
  );
}

const PRESETS = [10, 15, 30, 60];

/** Reopen a submitted attempt with extra minutes. */
export function ReopenAttemptDialog({ attemptId, answersMayBeOut }: { attemptId: string; answersMayBeOut: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [minutes, setMinutes] = React.useState("15");
  const [note, setNote] = React.useState("");
  const { run, pending } = useServerAction(reopenAttemptAction);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <TimerReset aria-hidden /> <T>Give extra time</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Give extra time</DialogTitle>
          <DialogDescription>
            The attempt reopens now with the student’s saved answers. They can change or add answers (all questions, including MCQs) until the extra time
            runs out, then it is submitted and regraded. Written marks become drafts again.
          </DialogDescription>
        </DialogHeader>
        {answersMayBeOut ? <FairnessWarning /> : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick choices">
          {PRESETS.map((m) => (
            <Button key={m} type="button" size="sm" variant={minutes === String(m) ? "default" : "outline"} onClick={() => setMinutes(String(m))}>
              <T vars={{ n: m }}>{"{n} minutes"}</T>
            </Button>
          ))}
        </div>
        <Field id="extra-minutes" label="Extra time (minutes)" required>
          {(a) => <Input type="number" min={1} max={1440} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} {...a} />}
        </Field>
        <Field id="extra-note" label="Reason (visible to the student)" description="Optional, e.g. “Power cut during the exam”.">
          {(a) => <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} {...a} />}
        </Field>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!Number(minutes)}
            onClick={async () => {
              const r = await run({ attemptId, minutes, note });
              if (r?.ok) setOpen(false);
            }}
          >
            Reopen with extra time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type LateStudent = { id: string; name: string; email: string };
export type Extension = {
  id: string;
  studentId: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  usedAt: string | null;
  revokedAt: string | null;
};

function GrantLateDialog({ examId, students, timezone, answersMayBeOut }: { examId: string; students: LateStudent[]; timezone: string; answersMayBeOut: boolean }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [studentId, setStudentId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const { run, pending } = useServerAction(grantLateStartAction);

  function onOpenChange(o: boolean) {
    if (pending) return;
    if (o) {
      // Default window: from now until the same time tomorrow, in the teacher's timezone.
      const now = Date.now();
      setStartsAt(utcToZonedInput(new Date(now).toISOString(), timezone));
      setEndsAt(utcToZonedInput(new Date(now + 86_400_000).toISOString(), timezone));
    }
    setOpen(o);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={students.length === 0}>
          <CalendarPlus aria-hidden /> <T>Allow a late attempt</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Allow a late attempt</DialogTitle>
          <DialogDescription>
            For a student who couldn’t take the exam. They can start one attempt inside this window, even if the exam has ended or their attempts are used
            up. They get the full exam duration, cut off at the window end.
          </DialogDescription>
        </DialogHeader>
        {answersMayBeOut ? <FairnessWarning /> : null}
        <Field id="late-student" label="Student" required>
          {(a) => (
            <NativeSelect value={studentId} onChange={(e) => setStudentId(e.target.value)} {...a}>
              <option value="">{t("Choose a student")}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email}
                  {s.name && s.email ? ` (${s.email})` : ""}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="late-from" label="From" required>
            {(a) => <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} {...a} />}
          </Field>
          <Field id="late-to" label="Until" required>
            {(a) => <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} {...a} />}
          </Field>
        </div>
        <Field id="late-note" label="Reason (visible to the student)" description="Optional, e.g. “Medical leave”.">
          {(a) => <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} {...a} />}
        </Field>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!studentId || !startsAt || !endsAt}
            onClick={async () => {
              const r = await run({ examId, studentId, startsAt, endsAt, note });
              if (r?.ok) {
                setOpen(false);
                setStudentId("");
                setNote("");
              }
            }}
          >
            Allow late attempt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extensionState(x: Extension, now: number): { label: string; tone: "success" | "info" | "neutral" | "warning" } {
  if (x.revokedAt) return { label: "Revoked", tone: "neutral" };
  if (x.usedAt) return { label: "Used", tone: "info" };
  if (new Date(x.endsAt).getTime() <= now) return { label: "Expired", tone: "neutral" };
  if (new Date(x.startsAt).getTime() > now) return { label: "Scheduled", tone: "warning" };
  return { label: "Open now", tone: "success" };
}

/** Late-attempt permissions for one exam: grant, list, revoke. */
export function LateAttemptsPanel({
  examId,
  students,
  extensions,
  timezone,
  answersMayBeOut,
  now,
}: {
  examId: string;
  students: LateStudent[];
  extensions: Extension[];
  timezone: string;
  answersMayBeOut: boolean;
  /** Server request time, so the status badges render the same on server and client. */
  now: number;
}) {
  const revoke = useServerAction(revokeExtensionAction);
  const nameOf = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? s.name || s.email : "—";
  };
  return (
    <section aria-labelledby="late-heading" className="surface mb-5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="late-heading" className="section-title">
            <T>Late attempts and extra time</T>
          </h2>
          <p className="text-subtle mt-1 text-sm">
            <T>To give a student more time on a submitted attempt, open the attempt and choose “Give extra time”.</T>
          </p>
        </div>
        <GrantLateDialog examId={examId} students={students} timezone={timezone} answersMayBeOut={answersMayBeOut} />
      </div>
      {extensions.length ? (
        <ul className="mt-4 divide-y text-sm">
          {extensions.map((x) => {
            const state = extensionState(x, now);
            const live = !x.usedAt && !x.revokedAt && new Date(x.endsAt).getTime() > now;
            return (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">
                    {nameOf(x.studentId)} <Badge tone={state.tone}>{state.label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <DateTimeText iso={x.startsAt} timeZone={timezone} /> – <DateTimeText iso={x.endsAt} timeZone={timezone} withZone />
                    {x.note ? ` · ${x.note}` : ""}
                  </p>
                </div>
                {live ? (
                  <ConfirmDialog
                    title="Revoke this late attempt?"
                    description="The student will no longer be able to start the exam in this window."
                    confirmLabel="Revoke"
                    destructive
                    onConfirm={async () => (await revoke.run(x.id))?.ok ?? false}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <X aria-hidden /> <T>Revoke</T>
                      </Button>
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
