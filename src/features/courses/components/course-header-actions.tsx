"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import { setCourseArchivedAction } from "../actions";
import { CourseFormDialog } from "./course-form-dialog";
import { T } from "@/lib/i18n/client";

export function CourseHeaderActions({ course }: { course: { id: string; title: string; code: string | null; description: string; archived: boolean } }) {
  const { run, pending } = useServerAction(setCourseArchivedAction);
  return (
    <>
      <CourseFormDialog
        course={course}
        trigger={
          <Button variant="outline">
            <Pencil aria-hidden /> <T>Edit</T>
          </Button>
        }
      />
      {course.archived ? (
        <Button variant="outline" pending={pending} onClick={() => run(course.id, false)}>
          <ArchiveRestore aria-hidden /> <T>Restore</T>
        </Button>
      ) : (
        <ConfirmDialog
          title="Archive this course?"
          description="Invitation codes stop working. Enrollments, exams and results are kept, and you can restore the course later."
          confirmLabel="Archive"
          onConfirm={async () => (await run(course.id, true))?.ok ?? false}
          trigger={
            <Button variant="outline">
              <Archive aria-hidden /> <T>Archive</T>
            </Button>
          }
        />
      )}
    </>
  );
}
