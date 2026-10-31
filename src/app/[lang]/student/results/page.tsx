import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { requireStudent } from "@/lib/auth/dal";
import { listStudentResults } from "@/features/attempts/result-queries";
import { StudentResultsTable } from "@/features/attempts/components/student-results-table";

export const metadata: Metadata = { title: "Results" };

async function Results() {
  const { profile, supabase } = await requireStudent();
  const results = await listStudentResults(supabase, profile.id);
  return <StudentResultsTable results={results} timezone={profile.timezone} />;
}

export default function StudentResultsPage() {
  return (
    <>
      <PageHeader title="My results" description="Scores appear once your teacher releases them." />
      <Suspense fallback={<TableSkeleton columns={5} />}>
        <Results />
      </Suspense>
    </>
  );
}
