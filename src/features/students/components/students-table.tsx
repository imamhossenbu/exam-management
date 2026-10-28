"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils/datetime";
import type { StudentRow } from "../queries";

type Row = StudentRow & { timezone: string };
const col = dataTableColumns<Row>();

const ENROLLMENT = {
  enrolled: { label: "Enrolled", tone: "success" as const },
  inactive: { label: "Inactive", tone: "warning" as const },
  not_enrolled: { label: "Not enrolled", tone: "neutral" as const },
};

const columns = [
  col.accessor("name", {
    header: "Student",
    sortFn: "text",
    cell: (info) => (
      <div>
        <Link href={`/teacher/students/${info.row.original.id}`} className="font-medium hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
      </div>
    ),
  }),
  col.accessor("email", { header: "Email", enableSorting: false, cell: () => null }),
  col.accessor("courseTitles", {
    header: "Courses",
    enableSorting: false,
    cell: (info) => <span className="line-clamp-1 max-w-64 text-muted-foreground">{info.getValue() || "—"}</span>,
  }),
  col.accessor("enrollment", {
    header: "Enrollment",
    filterFn: "equalsString",
    cell: (info) => <Badge tone={ENROLLMENT[info.getValue() as keyof typeof ENROLLMENT].tone}>{ENROLLMENT[info.getValue() as keyof typeof ENROLLMENT].label}</Badge>,
  }),
  col.accessor("joinedAt", { header: "Signed up", sortFn: "datetime", cell: (info) => formatDate(info.getValue(), info.row.original.timezone) }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: (info) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/teacher/students/${info.row.original.id}`}>View</Link>
      </Button>
    ),
  }),
];

export function StudentsTable({ students, timezone }: { students: StudentRow[]; timezone: string }) {
  return (
    <DataTable
      caption="Students"
      columns={columns}
      data={students.map((s) => ({ ...s, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search by name, email or course…"
      filters={[{ columnId: "enrollment", label: "Enrollment", options: Object.entries(ENROLLMENT).map(([value, e]) => ({ value, label: e.label })) }]}
      pageSize={25}
      emptyState={
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Students appear here after they create an account. Share an invitation code from a course so they can join."
          action={
            <Button asChild>
              <Link href="/teacher/courses">Go to courses</Link>
            </Button>
          }
        />
      }
    />
  );
}
