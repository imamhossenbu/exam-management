import type { ExamSummary } from "../analytics";

/**
 * Single-series horizontal bars: average % per exam. One hue (magnitude), values in
 * text ink, a native tooltip per bar, and the summary table below serves as the table view.
 */
export function ExamAverageChart({ summaries }: { summaries: ExamSummary[] }) {
  const data = summaries.filter((s) => s.average !== null).slice(0, 12);
  if (!data.length) return <p className="text-subtle">No fully graded attempts in this selection yet.</p>;
  return (
    <figure>
      <figcaption className="sr-only">Average score per exam, as a percentage</figcaption>
      <ul className="space-y-2.5">
        {data.map((s) => (
          <li key={s.examId} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm" title={`${s.examTitle}: average ${s.average}% across ${s.graded} graded attempt(s)`}>
            <span className="truncate text-muted-foreground">{s.examTitle}</span>
            <span className="relative h-3 rounded-full bg-muted" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(1, s.average!)}%` }} />
              {[25, 50, 75].map((g) => (
                <span key={g} className="absolute inset-y-0 w-px bg-surface" style={{ left: `${g}%` }} />
              ))}
            </span>
            <span className="text-right font-medium tabular-nums">{s.average}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 pl-[calc(min(10rem,40%)+0.75rem)] text-xs text-muted-foreground">0% · 25 · 50 · 75 · 100%</p>
    </figure>
  );
}
