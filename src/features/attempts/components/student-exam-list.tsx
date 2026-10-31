import Link from "next/link";
import { CalendarClock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { EXAM_TYPE_LABEL, PHASE_META, examPhase } from "@/features/exams/status";
import type { StudentExamRow } from "../queries";
import { DateTimeText, MinutesText, T } from "@/lib/i18n/client";

export function StudentExamList({ exams, timezone, now, emptyAction }: { exams: StudentExamRow[]; timezone: string; now: number; emptyAction?: React.ReactNode }) {
  if (exams.length === 0) {
    return <EmptyState icon={FileText} title="No exams yet" description="Exams your teacher publishes for your courses will appear here." action={emptyAction} />;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {exams.map((e) => {
        const phase = examPhase({ status: e.status, starts_at: e.startsAt, ends_at: e.endsAt }, now);
        const meta = PHASE_META[phase];
        const canStart = phase === "live" && (e.openAttemptId || e.attemptsUsed < e.maxAttempts);
        return (
          <li key={e.id} className="surface flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/student/exams/${e.id}`} className="font-medium hover:underline">
                  {e.title}
                </Link>
                <p className="text-xs text-muted-foreground">{e.courseTitle}</p>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              <DateTimeText iso={e.startsAt} timeZone={timezone} /> – <DateTimeText iso={e.endsAt} timeZone={timezone} />
            </p>
            <p className="text-xs text-muted-foreground">
              <T>{EXAM_TYPE_LABEL[e.examType]}</T> · <T vars={{ n: e.totalMarks }}>{"{n} marks"}</T> · <MinutesText minutes={e.durationMinutes} /> ·{" "}
              <T vars={{ used: e.attemptsUsed, max: e.maxAttempts }}>{"Attempts {used}/{max}"}</T>
            </p>
            <div className="mt-auto flex gap-2">
              <Button asChild size="sm" variant={canStart ? "default" : "outline"}>
                <Link href={e.openAttemptId ? `/student/attempts/${e.openAttemptId}` : `/student/exams/${e.id}`}>
                  {e.openAttemptId ? "Resume" : canStart ? "Start" : "Details"}
                </Link>
              </Button>
              {e.lastAttemptId && !e.openAttemptId ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/student/attempts/${e.lastAttemptId}/result`}><T>My result</T></Link>
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
