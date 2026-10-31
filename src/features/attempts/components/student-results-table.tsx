"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import type { StudentResultRow } from "../result-queries";
import { DateTimeText, T } from "@/lib/i18n/client";

type Row = StudentResultRow & { timezone: string };
const col = dataTableColumns<Row>();

const columns = [
  col.accessor("examTitle", {
    header: "Exam",
    sortFn: "text",
    cell: (info) => (
      <div>
        <Link href={`/student/attempts/${info.row.original.id}/result`} className="font-medium hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">
          {info.row.original.courseTitle} · Attempt {info.row.original.attemptNumber}
          {info.row.original.multipleAttempts && info.row.original.counted ? (
            <Badge tone="info" className="ml-2">
              <T>Counts for result</T>
            </Badge>
          ) : null}
        </p>
      </div>
    ),
  }),
  col.accessor("courseTitle", { header: "Course", filterFn: "equalsString", cell: () => null, enableSorting: false }),
  col.accessor((r) => r.submittedAt ?? "", { id: "submitted", header: "Submitted", sortFn: "datetime", cell: (info) => <DateTimeText iso={info.row.original.submittedAt} timeZone={info.row.original.timezone} /> }),
  col.accessor((r) => r.percentage ?? -1, {
    id: "score",
    header: "Score",
    cell: (info) =>
      info.row.original.released ? (
        <span className="tabular-nums">
          {info.row.original.score}/{info.row.original.maxScore} <span className="text-xs text-muted-foreground">({info.row.original.percentage}%)</span>
        </span>
      ) : (
        <Badge tone="warning">{info.row.original.status === "returned" ? "Corrections requested" : "Not released yet"}</Badge>
      ),
  }),
  col.accessor((r) => (r.passed === null ? "—" : r.passed ? "Passed" : "Not passed"), {
    id: "outcome",
    header: "Outcome",
    cell: (info) => (info.getValue() === "—" ? "—" : <Badge tone={info.getValue() === "Passed" ? "success" : "danger"}>{info.getValue()}</Badge>),
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only"><T>Actions</T></span>,
    cell: (info) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/student/attempts/${info.row.original.id}/result`}><T>View</T></Link>
      </Button>
    ),
  }),
];

export function StudentResultsTable({ results, timezone }: { results: StudentResultRow[]; timezone: string }) {
  const courses = [...new Set(results.map((r) => r.courseTitle))];
  return (
    <DataTable
      caption="My results"
      columns={columns}
      data={results.map((r) => ({ ...r, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search exams…"
      filters={[{ columnId: "courseTitle", label: "Courses", options: courses.map((c) => ({ value: c, label: c })) }]}
      emptyState={
        <EmptyState
          icon={Trophy}
          title="No results yet"
          description="After you submit an exam, it appears here."
          action={
            <Button asChild>
              <Link href="/student/exams"><T>See exams</T></Link>
            </Button>
          }
        />
      }
    />
  );
}
