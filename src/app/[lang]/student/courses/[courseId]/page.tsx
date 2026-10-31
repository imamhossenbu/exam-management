import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { requireStudent } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { listStudentExams } from "@/features/attempts/queries";
import { StudentExamList } from "@/features/attempts/components/student-exam-list";
import { T } from "@/lib/i18n/client";

async function CourseContent({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!uuid.safeParse(courseId).success) notFound();
  const { profile, supabase } = await requireStudent();
  // RLS returns the course only to active members.
  const { data: course } = await supabase.from("courses").select("id, title, code, description").eq("id", courseId).maybeSingle();
  if (!course) notFound();
  const exams = await listStudentExams(supabase, profile.id, course.id);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "My courses", href: "/student/courses" }, { label: course.title }]} title={course.title} description={course.description || undefined} />
      <h2 className="section-title mb-3"><T>Exams</T></h2>
      <StudentExamList exams={exams} timezone={profile.timezone} now={requestTime()} />
    </>
  );
}

export default function StudentCoursePage({ params }: PageProps<"/[lang]/student/courses/[courseId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <CardGridSkeleton count={4} />
        </>
      }
    >
      <CourseContent params={params} />
    </Suspense>
  );
}
