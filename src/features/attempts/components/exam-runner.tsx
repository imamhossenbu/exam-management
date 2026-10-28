"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, CheckCircle2, Clock, CloudOff, Info, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/datetime";
import { AutosaveQueue, type AnswerValue, type QuestionSaveState } from "../autosave";
import { submitAttemptAction } from "../actions";
import type { TakingFile, TakingQuestion } from "../queries";
import { AnswerUploads } from "./answer-uploads";

type ServerAnswer = { question_id: string; selected_option_id: string | null; text_answer: string | null; marked_for_review: boolean; revision: number };

type Props = {
  attemptId: string;
  studentId: string;
  examTitle: string;
  instructions: string;
  mode: "in_progress" | "returned";
  returnNote: string | null;
  deadlineAt: string;
  serverNow: string;
  questions: TakingQuestion[];
  answers: ServerAnswer[];
  files: TakingFile[];
};

const STORAGE_PREFIX = "examdesk:attempt:";

function readLocal(attemptId: string): Record<string, { value: AnswerValue; revision: number }> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + attemptId) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocal(attemptId: string, questionId: string, value: AnswerValue, revision: number) {
  try {
    const all = readLocal(attemptId);
    all[questionId] = { value, revision };
    localStorage.setItem(STORAGE_PREFIX + attemptId, JSON.stringify(all));
  } catch {
    // Storage may be unavailable (private mode); server autosave still works.
  }
}

function clearLocal(attemptId: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + attemptId);
  } catch {}
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline() {
  return React.useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function ExamRunner(props: Props) {
  const { attemptId, studentId, questions, mode } = props;
  const router = useRouter();
  const returned = mode === "returned";

  const [values, setValues] = React.useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(
      questions.map((q) => {
        const a = props.answers.find((x) => x.question_id === q.id);
        return [q.id, { selectedOptionId: a?.selected_option_id ?? null, textAnswer: a?.text_answer ?? null, marked: a?.marked_for_review ?? false }];
      }),
    ),
  );
  const [files, setFiles] = React.useState<TakingFile[]>(props.files);
  const [saveStates, setSaveStates] = React.useState<Record<string, QuestionSaveState>>({});
  const [current, setCurrent] = React.useState(0);
  const online = useOnline();
  const [locked, setLocked] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const submittedRef = React.useRef(false);
  const [closedByServer, setClosedByServer] = React.useState(false);

  // Server time is authoritative: the countdown is display-only and corrected for clock skew.
  const [offset] = React.useState(() => new Date(props.serverNow).getTime() - Date.now());
  const deadline = new Date(props.deadlineAt).getTime();
  const [remaining, setRemaining] = React.useState(() => deadline - (Date.now() + offset));

  const [queue] = React.useState(() => {
    const q = new AutosaveQueue(
      async (questionId, value, revision) => {
        const { data, error } = await createClient().rpc("save_answer", {
          p_attempt_id: attemptId,
          p_question_id: questionId,
          p_selected_option_id: value.selectedOptionId,
          p_text_answer: value.textAnswer,
          p_marked_for_review: value.marked,
          p_revision: revision,
        });
        if (error) throw error;
        const row = data?.[0];
        if (!row) throw new Error("No response");
        if (row.status === "deadline_passed" || row.status === "finalized") return { status: row.status };
        return { status: row.status as "saved" | "stale", revision: row.revision ?? revision, savedAt: row.saved_at };
      },
      {
        onState: (id, state) => setSaveStates((s) => (s[id] === state ? s : { ...s, [id]: state })),
        onClosed: () => setClosedByServer(true),
        persist: (id, value, revision) => writeLocal(attemptId, id, value, revision),
      },
    );
    for (const a of props.answers) {
      q.seed(a.question_id, { selectedOptionId: a.selected_option_id, textAnswer: a.text_answer, marked: a.marked_for_review }, a.revision);
    }
    return q;
  });

  const finish = React.useCallback(
    async (reason: "student" | "timeout" | "server") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setLocked(true);
      setSubmitting(true);
      if (!queue.isClosed) {
        // Give in-flight saves a moment (the server accepts saves for a few seconds past the deadline).
        await Promise.race([queue.flush(), new Promise((r) => setTimeout(r, 4000))]);
        queue.close();
      }
      try {
        const result = await submitAttemptAction(attemptId);
        if (result.ok) {
          clearLocal(attemptId);
          toast.success(reason === "student" ? "Submitted. Your answers are final." : "Time's up — your saved answers were submitted.");
        } else {
          toast.error(result.error);
        }
      } catch {
        // The server finalizes expired attempts on its own; the saved answers are safe.
        toast.error("Couldn't confirm submission. Your saved answers will be submitted automatically at the deadline.");
      }
      router.replace(`/student/attempts/${attemptId}/result`);
    },
    [attemptId, queue, router],
  );
  // The server rejected a save because the deadline passed or the attempt was finalized elsewhere.
  React.useEffect(() => {
    if (closedByServer) void finish("server");
  }, [closedByServer, finish]);

  // Restore answers that were changed on this device but never reached the server (crash, reload, offline).
  React.useEffect(() => {
    if (returned) return;
    const local = readLocal(attemptId);
    const restored: Record<string, AnswerValue> = {};
    for (const [qid, entry] of Object.entries(local)) {
      const server = props.answers.find((a) => a.question_id === qid);
      if (questions.some((q) => q.id === qid) && entry.revision > (server?.revision ?? 0)) {
        restored[qid] = entry.value;
        queue.update(qid, entry.value, 0, Math.max(server?.revision ?? 0, entry.revision - 1));
      }
    }
    if (Object.keys(restored).length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time recovery of locally persisted answers
      setValues((v) => ({ ...v, ...restored }));
      toast.info(`Restored ${Object.keys(restored).length} unsaved answer(s) from this device.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown, plus automatic submission at the deadline.
  React.useEffect(() => {
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        if (returned) {
          setLocked(true);
        } else {
          void finish("timeout");
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, finish, offset, returned]);

  const warnedRef = React.useRef({ five: false, one: false });
  React.useEffect(() => {
    if (remaining <= 5 * 60_000 && remaining > 60_000 && !warnedRef.current.five) {
      warnedRef.current.five = true;
      toast.warning("5 minutes left.");
    }
    if (remaining <= 60_000 && remaining > 0 && !warnedRef.current.one) {
      warnedRef.current.one = true;
      toast.warning("1 minute left. Your answers will be submitted automatically.");
    }
  }, [remaining]);

  // Connectivity + best-effort integrity log. This cannot prevent tab switching; it only records it.
  React.useEffect(() => {
    const supabase = createClient();
    const log = (type: string) => {
      if (submittedRef.current || returned) return;
      void supabase.rpc("log_attempt_event", { p_attempt_id: attemptId, p_event_type: type }).then(() => undefined, () => undefined);
    };
    const onVisibility = () => log(document.visibilityState === "hidden" ? "visibility_hidden" : "visibility_visible");
    const onOnline = () => {
      queue.retryNow();
      log("came_online");
    };
    const onOffline = () => log("went_offline");
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.hasUnsaved() && !submittedRef.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [attemptId, queue, returned]);

  function change(questionId: string, patch: Partial<AnswerValue>, debounceMs = 0) {
    if (locked || returned) return;
    const next = { ...values[questionId], ...patch };
    setValues((v) => ({ ...v, [questionId]: next }));
    queue.update(questionId, next, debounceMs);
  }

  const q = questions[current];
  const filesFor = (questionId: string, partId: string | null) => files.filter((f) => f.questionId === questionId && f.partId === partId);
  const isAnswered = (question: TakingQuestion) =>
    question.type === "mcq" ? Boolean(values[question.id]?.selectedOptionId) : Boolean(values[question.id]?.textAnswer?.trim()) || files.some((f) => f.questionId === question.id);
  const answeredCount = questions.filter(isAnswered).length;
  const markedCount = questions.filter((x) => values[x.id]?.marked).length;
  const states = Object.values(saveStates);
  const anyError = states.includes("error");
  const anySaving = states.includes("saving") || states.includes("pending");

  const status = !online
    ? { icon: CloudOff, text: "Offline — answers are kept on this device and will be saved when you reconnect", tone: "text-warning-soft-foreground bg-warning-soft" }
    : anyError
      ? { icon: AlertTriangle, text: "Some answers aren't saved yet — retrying", tone: "text-danger-soft-foreground bg-danger-soft" }
      : anySaving
        ? { icon: Loader2, text: "Saving…", tone: "text-muted-foreground bg-muted" }
        : { icon: CheckCircle2, text: "All answers saved", tone: "text-success-soft-foreground bg-success-soft" };
  const lowTime = remaining <= 5 * 60_000;

  return (
    <div className="space-y-4">
      <div className="surface sticky top-16 z-20 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{props.examTitle}</h1>
          <p role="status" aria-live="polite" className={cn("mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs", status.tone)}>
            <status.icon className={cn("size-3.5", status.icon === Loader2 && "animate-spin")} aria-hidden />
            {status.text}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-lg tabular-nums", lowTime ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted")}
            role="timer"
            aria-label={`Time remaining ${formatDuration(remaining)}`}
          >
            <Clock className="size-4" aria-hidden />
            {formatDuration(remaining)}
          </div>
          <Button onClick={() => setConfirmOpen(true)} disabled={submitting || (locked && !returned)}>
            <Send aria-hidden /> {returned ? "Resubmit" : "Submit"}
          </Button>
        </div>
      </div>

      {returned ? (
        <div role="note" className="flex gap-2 rounded-md border bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Your teacher returned this attempt for correction.</p>
            {props.returnNote ? <p className="mt-1 whitespace-pre-wrap">{props.returnNote}</p> : null}
            <p className="mt-1">Upload corrected answer pages, then resubmit before the deadline. Multiple-choice answers can&apos;t be changed.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <section aria-labelledby="question-heading" className="surface min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="question-heading" className="section-title">
              Question {current + 1} of {questions.length}
            </h2>
            <div className="flex items-center gap-2">
              <Badge>{q.marks} mark{q.marks === 1 ? "" : "s"}</Badge>
              {q.negativeMarks > 0 ? <Badge tone="danger">−{q.negativeMarks} if wrong</Badge> : null}
              {saveStates[q.id] === "error" ? <Badge tone="danger">Not saved</Badge> : saveStates[q.id] === "pending" || saveStates[q.id] === "saving" ? <Badge>Saving…</Badge> : null}
            </div>
          </div>
          <p className="prose-text">{q.body}</p>
          {q.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL
            <img src={q.imageUrl} alt={`Figure for question ${current + 1}`} className="mt-4 max-h-96 rounded-md border" />
          ) : null}

          {q.type === "mcq" ? (
            <fieldset className="mt-5 grid gap-2" disabled={locked || returned}>
              <legend className="sr-only">Choose one answer</legend>
              {q.options.map((o, i) => {
                const checked = values[q.id]?.selectedOptionId === o.id;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-sm transition-colors hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                      checked && "border-primary bg-primary-soft/60",
                    )}
                  >
                    <input type="radio" name={`q-${q.id}`} className="mt-0.5 size-4 accent-primary" checked={checked} onChange={() => change(q.id, { selectedOptionId: o.id })} />
                    <span className="font-medium">{String.fromCharCode(65 + i)}.</span>
                    <span className="flex-1">{o.body}</span>
                  </label>
                );
              })}
              {values[q.id]?.selectedOptionId && !locked && !returned ? (
                <div>
                  <Button type="button" variant="link" size="sm" className="px-0" onClick={() => change(q.id, { selectedOptionId: null })}>
                    Clear my answer
                  </Button>
                </div>
              ) : null}
            </fieldset>
          ) : (
            <div className="mt-5 space-y-5">
              {q.parts.length ? (
                <ol className="space-y-1 text-sm">
                  {q.parts.map((p) => (
                    <li key={p.id}>
                      <span className="font-medium">({p.label})</span> {p.body} <span className="text-muted-foreground">[{p.marks}]</span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {q.parts.length ? (
                q.parts.map((p) => (
                  <AnswerUploads
                    key={p.id}
                    attemptId={attemptId}
                    studentId={studentId}
                    questionId={q.id}
                    partId={p.id}
                    label={`Answer sheets for (${p.label})`}
                    files={filesFor(q.id, p.id)}
                    disabled={locked}
                    onChange={(next) => setFiles((all) => [...all.filter((f) => !(f.questionId === q.id && f.partId === p.id)), ...next])}
                  />
                ))
              ) : (
                <AnswerUploads
                  attemptId={attemptId}
                  studentId={studentId}
                  questionId={q.id}
                  partId={null}
                  label="Answer sheets"
                  files={filesFor(q.id, null)}
                  disabled={locked}
                  onChange={(next) => setFiles((all) => [...all.filter((f) => !(f.questionId === q.id && f.partId === null)), ...next])}
                />
              )}
              {!returned ? (
                <div>
                  <label htmlFor={`text-${q.id}`} className="text-sm font-medium">
                    Typed answer <span className="font-normal text-muted-foreground">(optional, in addition to uploads)</span>
                  </label>
                  <Textarea
                    id={`text-${q.id}`}
                    rows={6}
                    className="mt-1.5"
                    placeholder="Type your answer here (optional). Uploaded pages are graded too."
                    disabled={locked}
                    value={values[q.id]?.textAnswer ?? ""}
                    maxLength={20000}
                    onChange={(e) => change(q.id, { textAnswer: e.target.value || null }, 800)}
                  />
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              <ArrowLeft aria-hidden /> Previous
            </Button>
            {!returned ? (
              <Button variant="ghost" disabled={locked} onClick={() => change(q.id, { marked: !values[q.id]?.marked })} aria-pressed={values[q.id]?.marked ?? false}>
                {values[q.id]?.marked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
                {values[q.id]?.marked ? "Marked for review" : "Mark for review"}
              </Button>
            ) : null}
            <Button variant="outline" disabled={current === questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>
              Next <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>

        <aside className="surface h-fit p-4 lg:sticky lg:top-40" aria-label="Question navigator">
          <p className="mb-3 text-sm">
            <span className="font-semibold">{answeredCount}</span>/{questions.length} answered
            {markedCount ? <span className="text-muted-foreground"> · {markedCount} marked</span> : null}
          </p>
          <ol className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((question, i) => {
              const answered = isAnswered(question);
              const marked = values[question.id]?.marked;
              const err = saveStates[question.id] === "error";
              return (
                <li key={question.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={i === current ? "step" : undefined}
                    aria-label={`Question ${i + 1}${answered ? ", answered" : ", not answered"}${marked ? ", marked for review" : ""}${err ? ", not saved" : ""}`}
                    className={cn(
                      "relative grid h-9 w-full place-items-center rounded-md border text-sm font-medium tabular-nums focus-ring",
                      answered ? "border-primary bg-primary text-primary-foreground" : "bg-surface hover:bg-muted",
                      marked && "ring-2 ring-warning ring-offset-1 ring-offset-surface",
                      i === current && "outline-2 outline-offset-2 outline-foreground",
                    )}
                  >
                    {i + 1}
                    {err ? <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-danger" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-primary" aria-hidden /> Answered
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm ring-2 ring-warning" aria-hidden /> Marked for review
            </li>
            <li className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-danger" aria-hidden /> Not saved yet
            </li>
          </ul>
          {props.instructions ? (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">Instructions</summary>
              <p className="prose-text mt-2 text-muted-foreground">{props.instructions}</p>
            </details>
          ) : null}
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{returned ? "Resubmit your corrections?" : "Submit your exam?"}</DialogTitle>
            <DialogDescription>Submission is final. You won&apos;t be able to change your answers afterwards.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            <li>
              Answered: <span className="font-semibold">{answeredCount}</span> of {questions.length}
            </li>
            {questions.length - answeredCount > 0 ? <li className="text-warning-soft-foreground">{questions.length - answeredCount} question(s) unanswered</li> : null}
            {markedCount ? <li>{markedCount} marked for review</li> : null}
            {anyError || !online ? <li className="text-danger">Some answers haven&apos;t reached the server yet. We&apos;ll try once more before submitting.</li> : null}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button pending={submitting} onClick={() => finish("student")}>
              Submit final answers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
