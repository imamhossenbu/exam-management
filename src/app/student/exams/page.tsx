import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { requireStudent } from "@/lib/auth/dal";
import { listStudentExams } from "@/features/attempts/queries";
import { StudentExamList } from "@/features/attempts/components/student-exam-list";
import { examPhase } from "@/features/exams/status";

export const metadata: Metadata = { title: "Exams" };

async function Exams() {
  const { profile, supabase } = await requireStudent();
  const exams = await listStudentExams(supabase, profile.id);
  const now = requestTime();
  const rank = { live: 0, scheduled: 1, ended: 2, closed: 2, draft: 3, archived: 3 } as const;
  exams.sort((a, b) => {
    const pa = rank[examPhase({ status: a.status, starts_at: a.startsAt, ends_at: a.endsAt }, now)];
    const pb = rank[examPhase({ status: b.status, starts_at: b.startsAt, ends_at: b.endsAt }, now)];
    return pa - pb || (pa === 1 ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt));
  });
  return <StudentExamList exams={exams} timezone={profile.timezone} now={now} />;
}

export default function StudentExamsPage() {
  return (
    <>
      <PageHeader title="Exams" description="Live exams first, then upcoming and past ones." />
      <Suspense fallback={<CardGridSkeleton count={4} />}>
        <Exams />
      </Suspense>
    </>
  );
}
