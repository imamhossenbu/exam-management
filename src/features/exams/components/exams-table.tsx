"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime, formatMinutes } from "@/lib/utils/datetime";
import { EXAM_TYPE_LABEL, PHASE_META, type ExamPhase } from "../status";
import type { TeacherExamRow } from "../queries";
import { T } from "@/lib/i18n/client";

type Row = TeacherExamRow & { phase: ExamPhase; timezone: string };
const col = dataTableColumns<Row>();

const columns = [
  col.accessor("title", {
    header: "Exam",
    sortFn: "text",
    cell: (info) => (
      <div>
        <Link href={`/teacher/exams/${info.row.original.id}`} className="font-medium hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">
          {EXAM_TYPE_LABEL[info.row.original.examType]} · {info.row.original.totalMarks} marks · {formatMinutes(info.row.original.durationMinutes)}
        </p>
      </div>
    ),
  }),
  col.accessor("courseTitle", { header: "Course", filterFn: "equalsString", sortFn: "text" }),
  col.accessor("phase", {
    header: "Status",
    filterFn: "equalsString",
    cell: (info) => <Badge tone={PHASE_META[info.getValue()].tone}>{PHASE_META[info.getValue()].label}</Badge>,
  }),
  col.accessor("startsAt", {
    header: "Window",
    sortFn: "datetime",
    cell: (info) => (
      <span className="text-xs whitespace-nowrap">
        {formatDateTime(info.getValue(), info.row.original.timezone)}
        <br />
        <span className="text-muted-foreground">to {formatDateTime(info.row.original.endsAt, info.row.original.timezone)}</span>
      </span>
    ),
  }),
  col.accessor("questionCount", { header: "Questions", cell: (info) => <span className="tabular-nums">{info.getValue()}</span> }),
  col.accessor("attemptCount", { header: "Attempts", cell: (info) => <span className="tabular-nums">{info.getValue()}</span> }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only"><T>Actions</T></span>,
    cell: (info) => (
      <div className="flex justify-end gap-1">
        {info.row.original.attemptCount > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/teacher/exams/${info.row.original.id}/attempts`}><T>Attempts</T></Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/teacher/exams/${info.row.original.id}`}><T>Open</T></Link>
        </Button>
      </div>
    ),
  }),
];

export function ExamsTable({ exams, timezone }: { exams: (TeacherExamRow & { phase: ExamPhase })[]; timezone: string }) {
  const courses = [...new Set(exams.map((e) => e.courseTitle))].sort();
  return (
    <DataTable
      caption="Exams"
      columns={columns}
      data={exams.map((e) => ({ ...e, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search exams…"
      filters={[
        { columnId: "courseTitle", label: "Courses", options: courses.map((c) => ({ value: c, label: c })) },
        { columnId: "phase", label: "Statuses", options: Object.entries(PHASE_META).map(([value, m]) => ({ value, label: m.label })) },
      ]}
      emptyState={
        <EmptyState
          icon={FileText}
          title="No exams yet"
          description="Create an MCQ, written or mixed exam for one of your courses."
          action={
            <Button asChild>
              <Link href="/teacher/exams/new">
                <Plus aria-hidden /> <T>New exam</T>
              </Link>
            </Button>
          }
        />
      }
    />
  );
}
