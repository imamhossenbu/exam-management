"use client";

import Link from "next/link";
import { ExternalLink, FileStack, Trash2 } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerAction } from "@/components/forms/use-server-action";
import { formatBytes } from "@/lib/utils/files";
import { formatDateTime } from "@/lib/utils/datetime";
import { deleteSourceAction } from "../actions";
import type { SourceRow } from "../queries";
import { T } from "@/lib/i18n/client";

type Row = SourceRow & { timezone: string };
const col = dataTableColumns<Row>();
const STATUS = { pending: "Not extracted", extracted: "Text ready", failed: "Needs manual text", manual: "Manual / OCR" } as const;

function Actions({ source }: { source: Row }) {
  const { run } = useServerAction(deleteSourceAction);
  return (
    <div className="flex justify-end gap-1">
      {source.url ? (
        <Button asChild variant="ghost" size="icon-sm">
          <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.fileName}`}>
            <ExternalLink />
          </a>
        </Button>
      ) : null}
      <ConfirmDialog
        title="Delete this file?"
        description="The original file and its extracted text are deleted. Questions already created from it stay in their exams."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => (await run(source.id))?.ok ?? false}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${source.fileName}`}>
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}

const columns = [
  col.accessor("fileName", {
    header: "File",
    sortFn: "text",
    cell: (info) => (
      <div>
        <p className="font-medium">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(info.row.original.sizeBytes)}</p>
      </div>
    ),
  }),
  col.accessor((r) => r.examTitle ?? "—", {
    id: "exam",
    header: "Exam",
    cell: (info) =>
      info.row.original.examId ? (
        <Link className="hover:underline" href={`/teacher/exams/${info.row.original.examId}/import`}>
          {info.getValue()}
        </Link>
      ) : (
        "—"
      ),
  }),
  col.accessor((r) => r.courseTitle ?? "—", { id: "course", header: "Course", filterFn: "equalsString" }),
  col.accessor("status", { header: "Text", filterFn: "equalsString", cell: (info) => <Badge>{STATUS[info.getValue()]}</Badge> }),
  col.accessor("createdAt", { header: "Uploaded", sortFn: "datetime", cell: (info) => formatDateTime(info.getValue(), info.row.original.timezone) }),
  col.display({ id: "actions", header: () => <span className="sr-only"><T>Actions</T></span>, cell: (info) => <Actions source={info.row.original} /> }),
];

export function SourcesTable({ sources, timezone }: { sources: SourceRow[]; timezone: string }) {
  const courses = [...new Set(sources.map((s) => s.courseTitle ?? "—"))];
  return (
    <DataTable
      caption="Question source files"
      columns={columns}
      data={sources.map((s) => ({ ...s, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search files…"
      filters={[
        { columnId: "course", label: "Courses", options: courses.map((c) => ({ value: c, label: c })) },
        { columnId: "status", label: "Text status", options: Object.entries(STATUS).map(([value, label]) => ({ value, label })) },
      ]}
      emptyState={
        <EmptyState
          icon={FileStack}
          title="No source files yet"
          description="Upload question papers from an exam's “Import from PDF/image” page. Files stay private to you."
          action={
            <Button asChild>
              <Link href="/teacher/exams"><T>Go to exams</T></Link>
            </Button>
          }
        />
      }
    />
  );
}
