import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { listTeacherExams } from "@/features/exams/queries";
import { ExamsTable } from "@/features/exams/components/exams-table";
import { examPhase } from "@/features/exams/status";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Exams" };

async function Exams() {
  const { profile, supabase } = await requireTeacher();
  const exams = await listTeacherExams(supabase);
  const now = requestTime();
  const rows = exams.map((e) => ({ ...e, phase: examPhase({ status: e.status, starts_at: e.startsAt, ends_at: e.endsAt }, now) }));
  return <ExamsTable exams={rows} timezone={profile.timezone} />;
}

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        title="Exams"
        description="Build, schedule and publish exams. Published exams are locked to protect attempts."
        actions={
          <Button asChild>
            <Link href="/teacher/exams/new">
              <Plus aria-hidden /> <T>New exam</T>
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton columns={7} />}>
        <Exams />
      </Suspense>
    </>
  );
}
