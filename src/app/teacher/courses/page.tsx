import { Suspense } from "react";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { listTeacherCourses } from "@/features/courses/queries";
import { CoursesTable } from "@/features/courses/components/courses-table";
import { CourseFormDialog } from "@/features/courses/components/course-form-dialog";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Courses" };

async function Courses() {
  const { profile, supabase } = await requireTeacher();
  const courses = await listTeacherCourses(supabase);
  return <CoursesTable courses={courses} timezone={profile.timezone} />;
}

export default function CoursesPage() {
  return (
    <>
      <PageHeader
        title="Courses"
        description="Manage your courses, enrollments and invitation codes."
        actions={
          <CourseFormDialog
            trigger={
              <Button>
                <Plus aria-hidden /> <T>New course</T>
              </Button>
            }
          />
        }
      />
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <Courses />
      </Suspense>
    </>
  );
}
