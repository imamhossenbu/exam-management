import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { getTeacherCourse } from "@/features/courses/queries";
import { CourseDetailTabs } from "@/features/courses/components/course-detail-tabs";
import { CourseHeaderActions } from "@/features/courses/components/course-header-actions";
import { MembersTable } from "@/features/courses/components/members-table";
import { InvitesPanel } from "@/features/courses/components/invites-panel";
import { TaxonomyPanel } from "@/features/courses/components/taxonomy-panel";
import { EXAM_TYPE_LABEL, PHASE_META, examPhase } from "@/features/exams/status";
import { uuid } from "@/lib/validations/courses";

async function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!uuid.safeParse(courseId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  const detail = await getTeacherCourse(supabase, courseId);
  if (!detail) notFound();
  const { course, members, invites, subjects, exams } = detail;
  const archived = Boolean(course.archived_at);
  const now = requestTime();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Courses", href: "/teacher/courses" }, { label: course.title }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {course.title}
            {course.code ? <Badge>{course.code}</Badge> : null}
            {archived ? <Badge tone="warning">Archived</Badge> : null}
          </span>
        }
        description={course.description || undefined}
        actions={<CourseHeaderActions course={{ id: course.id, title: course.title, code: course.code, description: course.description, archived }} />}
      />
      <CourseDetailTabs
        counts={{ students: members.filter((m) => m.status === "active").length, invites: invites.length, subjects: subjects.length, exams: exams.length }}
        students={<MembersTable courseId={course.id} members={members} timezone={profile.timezone} />}
        invites={<InvitesPanel courseId={course.id} invites={invites} timezone={profile.timezone} archived={archived} now={now} />}
        taxonomy={<TaxonomyPanel courseId={course.id} subjects={subjects} />}
        exams={
          exams.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No exams in this course"
              action={
                <Button asChild>
                  <Link href={`/teacher/exams/new?course=${course.id}`}>
                    <Plus aria-hidden /> Create exam
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="surface divide-y">
              {exams.map((exam) => {
                const phase = PHASE_META[examPhase(exam, now)];
                return (
                  <li key={exam.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link href={`/teacher/exams/${exam.id}`} className="font-medium hover:underline">
                        {exam.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {EXAM_TYPE_LABEL[exam.exam_type]} · {exam.total_marks} marks · {formatDateTime(exam.starts_at, profile.timezone)}
                      </p>
                    </div>
                    <Badge tone={phase.tone}>{phase.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )
        }
      />
    </>
  );
}

export default function CourseDetailPage({ params }: PageProps<"/teacher/courses/[courseId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <CourseDetail params={params} />
    </Suspense>
  );
}
