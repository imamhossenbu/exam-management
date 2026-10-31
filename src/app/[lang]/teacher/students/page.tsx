import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { requireTeacher } from "@/lib/auth/dal";
import { listStudents } from "@/features/students/queries";
import { StudentsTable } from "@/features/students/components/students-table";

export const metadata: Metadata = { title: "Students" };

async function Students() {
  const { profile, supabase } = await requireTeacher();
  const students = await listStudents(supabase);
  return <StudentsTable students={students} timezone={profile.timezone} />;
}

export default function StudentsPage() {
  return (
    <>
      <PageHeader title="Students" description="Everyone with a student account, and the courses they're enrolled in." />
      <Suspense fallback={<TableSkeleton columns={5} rows={8} />}>
        <Students />
      </Suspense>
    </>
  );
}
