"use client";

import Link from "next/link";
import { ClipboardCheck, Eye } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/utils/datetime";
import type { AttemptRow } from "../queries";

type Row = AttemptRow & { timezone: string };
const col = dataTableColumns<Row>();

const GRADING: Record<AttemptRow["gradingStatus"], { label: string; tone: BadgeTone }> = {
  in_progress: { label: "In progress", tone: "info" },
  pending: { label: "Needs grading", tone: "warning" },
  in_review: { label: "Grading", tone: "info" },
  returned: { label: "Returned to student", tone: "neutral" },
  graded: { label: "Graded", tone: "success" },
};

function buildColumns(showExam: boolean) {
  return [
    col.accessor("studentName", {
      header: "Student",
      sortFn: "text",
      cell: (info) => (
        <div>
          <Link href={`/teacher/students/${info.row.original.studentId}`} className="font-medium hover:underline">
            {info.getValue()}
          </Link>
          <p className="text-xs text-muted-foreground">{info.row.original.studentEmail}</p>
        </div>
      ),
    }),
    col.accessor("studentEmail", { header: "Email", enableSorting: false, cell: () => null }),
    ...(showExam
      ? [
          col.accessor("examTitle", {
            header: "Exam",
            filterFn: "equalsString",
            sortFn: "text",
            cell: (info) => (
              <div>
                <Link href={`/teacher/exams/${info.row.original.examId}`} className="hover:underline">
                  {info.getValue()}
                </Link>
                <p className="text-xs text-muted-foreground">{info.row.original.courseTitle}</p>
              </div>
            ),
          }),
        ]
      : []),
    col.accessor("attemptNumber", { header: "#", cell: (info) => <span className="tabular-nums">{info.getValue()}</span> }),
    col.accessor((r) => r.submittedAt ?? r.startedAt, {
      id: "when",
      header: "Submitted",
      sortFn: "datetime",
      cell: (info) => (
        <span className="text-xs whitespace-nowrap">
          {info.row.original.submittedAt ? formatDateTime(info.row.original.submittedAt, info.row.original.timezone) : "—"}
          {info.row.original.submittedVia === "timeout" ? <span className="block text-muted-foreground">Auto (time up)</span> : null}
          {info.row.original.submittedVia === "teacher" ? <span className="block text-muted-foreground">Exam closed</span> : null}
        </span>
      ),
    }),
    col.accessor((r) => r.percentage ?? -1, {
      id: "score",
      header: "Score",
      cell: (info) =>
        info.row.original.score === null ? (
          "—"
        ) : (
          <span className="tabular-nums">
            {info.row.original.score}/{info.row.original.maxScore}
            <span className="ml-1 text-xs text-muted-foreground">({info.row.original.percentage}%)</span>
          </span>
        ),
    }),
    col.accessor("gradingStatus", {
      header: "Grading",
      filterFn: "equalsString",
      cell: (info) => <Badge tone={GRADING[info.getValue()].tone}>{GRADING[info.getValue()].label}</Badge>,
    }),
    col.accessor("tabSwitches", {
      header: "Left tab",
      cell: (info) =>
        info.getValue() ? (
          <span className="tabular-nums" title="Best-effort signal: times the exam tab was hidden. Not proof of misconduct.">
            {info.getValue()}×
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: (info) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/teacher/attempts/${info.row.original.id}`}>
            {info.row.original.gradingStatus === "pending" || info.row.original.gradingStatus === "in_review" ? <ClipboardCheck aria-hidden /> : <Eye aria-hidden />}
            {info.row.original.gradingStatus === "pending" || info.row.original.gradingStatus === "in_review" ? "Grade" : "Review"}
          </Link>
        </Button>
      ),
    }),
  ];
}

const withExam = buildColumns(true);
const withoutExam = buildColumns(false);

export function AttemptsTable({
  attempts,
  timezone,
  showExam = true,
  emptyTitle = "No attempts yet",
  toolbar,
}: {
  attempts: AttemptRow[];
  timezone: string;
  showExam?: boolean;
  emptyTitle?: string;
  toolbar?: React.ReactNode;
}) {
  const exams = [...new Set(attempts.map((a) => a.examTitle))].sort();
  return (
    <DataTable
      caption="Exam attempts"
      columns={showExam ? withExam : withoutExam}
      data={attempts.map((a) => ({ ...a, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search students…"
      toolbar={toolbar}
      pageSize={25}
      filters={[
        ...(showExam ? [{ columnId: "examTitle", label: "Exams", options: exams.map((e) => ({ value: e, label: e })) }] : []),
        { columnId: "gradingStatus", label: "Grading", options: Object.entries(GRADING).map(([value, g]) => ({ value, label: g.label })) },
      ]}
      emptyState={<EmptyState icon={ClipboardCheck} title={emptyTitle} />}
    />
  );
}
