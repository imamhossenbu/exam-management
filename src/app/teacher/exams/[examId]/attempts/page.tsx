import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { listAttempts } from "@/features/grading/queries";
import { AttemptsTable } from "@/features/grading/components/attempts-table";
import { T } from "@/lib/i18n/client";

async function Attempts({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!uuid.safeParse(examId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  const { data: exam } = await supabase.from("exams").select("id, title").eq("id", examId).maybeSingle();
  if (!exam) notFound();
  const attempts = await listAttempts(supabase, { examId });
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/teacher/exams" }, { label: exam.title, href: `/teacher/exams/${exam.id}` }, { label: "Attempts" }]}
        title="Attempts"
        description="Tab-switch counts are a best-effort signal only; a web page can't prevent or prove off-screen activity."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/results?examId=${exam.id}`} download>
              <Download aria-hidden /> <T>Export CSV</T>
            </a>
          </Button>
        }
      />
      <AttemptsTable attempts={attempts} timezone={profile.timezone} showExam={false} />
    </>
  );
}

export default function ExamAttemptsPage({ params }: PageProps<"/teacher/exams/[examId]/attempts">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <TableSkeleton columns={7} />
        </>
      }
    >
      <Attempts params={params} />
    </Suspense>
  );
}
