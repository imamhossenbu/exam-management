import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { listSources } from "@/features/sources/queries";
import { ImportWorkspace } from "@/features/sources/components/import-workspace";
import { T } from "@/lib/i18n/client";

async function ImportContent({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!uuid.safeParse(examId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  const { data: exam } = await supabase.from("exams").select("id, title, status, exam_type").eq("id", examId).maybeSingle();
  if (!exam) notFound();
  const crumbs = [
    { label: "Exams", href: "/teacher/exams" },
    { label: exam.title, href: `/teacher/exams/${exam.id}` },
    { label: "Import questions" },
  ];
  if (exam.status !== "draft") {
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Import questions" />
        <EmptyState
          icon={Lock}
          title="This exam is published"
          description="Questions can only be added to draft exams. Duplicate the exam to create an editable copy."
          action={
            <Button asChild variant="outline">
              <Link href={`/teacher/exams/${exam.id}`}><T>Back to exam</T></Link>
            </Button>
          }
        />
      </>
    );
  }
  const sources = await listSources(supabase, { examId: exam.id });
  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title="Import questions"
        description="Upload a PDF or image, review the extracted text and detected questions, then add the ones you've checked. Nothing is published automatically."
        actions={
          <Button asChild variant="outline">
            <Link href={`/teacher/exams/${exam.id}`}><T>Done</T></Link>
          </Button>
        }
      />
      <ImportWorkspace examId={exam.id} examType={exam.exam_type} teacherId={profile.id} sources={sources} />
    </>
  );
}

export default function ImportPage({ params }: PageProps<"/[lang]/teacher/exams/[examId]/import">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <ImportContent params={params} />
    </Suspense>
  );
}
