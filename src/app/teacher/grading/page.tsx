import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { requireTeacher } from "@/lib/auth/dal";
import { listAttempts } from "@/features/grading/queries";
import { AttemptsTable } from "@/features/grading/components/attempts-table";

export const metadata: Metadata = { title: "Grading" };

async function Queue() {
  const { profile, supabase } = await requireTeacher();
  const attempts = await listAttempts(supabase, { needsGrading: true });
  return <AttemptsTable attempts={attempts} timezone={profile.timezone} emptyTitle="Nothing to grade — you're all caught up" />;
}

export default function GradingPage() {
  return (
    <>
      <PageHeader title="Grading" description="Submitted attempts with written answers that still need marks." />
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <Queue />
      </Suspense>
    </>
  );
}
