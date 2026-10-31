"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, BookOpen, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerAction } from "@/components/forms/use-server-action";
import { formatDate } from "@/lib/utils/datetime";
import { setCourseArchivedAction } from "../actions";
import type { TeacherCourseRow } from "../queries";
import { CourseFormDialog } from "./course-form-dialog";
import { T } from "@/lib/i18n/client";

const col = dataTableColumns<TeacherCourseRow & { timezone: string }>();

function RowActions({ course }: { course: TeacherCourseRow }) {
  const { run } = useServerAction(setCourseArchivedAction);
  return (
    <div className="flex justify-end gap-1">
      <CourseFormDialog
        course={course}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${course.title}`}>
            <Pencil />
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${course.title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <Link href={`/teacher/courses/${course.id}`}>
              <BookOpen aria-hidden /> <T>Open course</T>
            </Link>
          </DropdownMenuItem>
          {course.archived ? (
            <DropdownMenuItem onSelect={() => run(course.id, false)}>
              <ArchiveRestore aria-hidden /> <T>Restore</T>
            </DropdownMenuItem>
          ) : (
            <ConfirmDialog
              title="Archive this course?"
              description="Students will no longer be able to join with its codes. Existing exams, results and enrollments are kept, and you can restore it later."
              confirmLabel="Archive"
              onConfirm={async () => (await run(course.id, true))?.ok ?? false}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Archive aria-hidden /> <T>Archive</T>
                </DropdownMenuItem>
              }
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const columns = [
  col.accessor("title", {
    header: "Course",
    sortFn: "text",
    cell: (info) => (
      <Link href={`/teacher/courses/${info.row.original.id}`} className="font-medium hover:underline">
        {info.getValue()}
        {info.row.original.code ? <span className="ml-2 text-xs text-muted-foreground">{info.row.original.code}</span> : null}
      </Link>
    ),
  }),
  col.accessor("activeStudents", { header: "Students", cell: (info) => <span className="tabular-nums">{info.getValue()}</span> }),
  col.accessor("examCount", { header: "Exams", cell: (info) => <span className="tabular-nums">{info.getValue()}</span> }),
  col.accessor((row) => (row.archived ? "archived" : "active"), {
    id: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: (info) => <Badge tone={info.getValue() === "active" ? "success" : "neutral"}>{info.getValue() === "active" ? "Active" : "Archived"}</Badge>,
  }),
  col.accessor("createdAt", {
    header: "Created",
    sortFn: "datetime",
    cell: (info) => formatDate(info.getValue(), info.row.original.timezone),
  }),
  col.display({ id: "actions", header: () => <span className="sr-only"><T>Actions</T></span>, cell: (info) => <RowActions course={info.row.original} /> }),
];

export function CoursesTable({ courses, timezone }: { courses: TeacherCourseRow[]; timezone: string }) {
  return (
    <DataTable
      caption="Courses"
      columns={columns}
      data={courses.map((c) => ({ ...c, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search courses…"
      filters={[{ columnId: "status", label: "Statuses", options: [{ label: "Active", value: "active" }, { label: "Archived", value: "archived" }] }]}
      emptyState={
        <EmptyState
          icon={BookOpen}
          title="Create your first course"
          description="Courses hold your students, invitation codes, subjects and exams."
          action={
            <CourseFormDialog
              trigger={
                <Button>
                  <Plus aria-hidden /> <T>New course</T>
                </Button>
              }
            />
          }
        />
      }
    />
  );
}
