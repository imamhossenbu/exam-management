import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/dal";
import { listCourseOptions } from "@/features/courses/queries";
import { ExamSettingsForm } from "@/features/exams/components/exam-settings-form";
import { utcToZonedInput } from "@/lib/utils/datetime";

export const metadata: Metadata = { title: "New exam" };

async function NewExam({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const [{ course }, { profile, supabase }] = await Promise.all([searchParams, requireTeacher()]);
  const courses = (await listCourseOptions(supabase)).filter((c) => !c.archived_at);
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Create a course first"
        description="Exams belong to a course so the right students can take them."
        action={
          <Button asChild>
            <Link href="/teacher/courses">Go to courses</Link>
          </Button>
        }
      />
    );
  }
  // Default: tomorrow 09:00–11:00 in the teacher's timezone.
  const tomorrow = utcToZonedInput(new Date(requestTime() + 86_400_000).toISOString(), profile.timezone).slice(0, 10);
  return (
    <ExamSettingsForm
      courses={courses}
      timezone={profile.timezone}
      defaultValues={{
        courseId: courses.some((c) => c.id === course) ? (course as string) : courses.length === 1 ? courses[0].id : "",
        subjectId: "",
        chapterIds: [],
        title: "",
        description: "",
        instructions: "",
        examType: "mcq",
        totalMarks: "20",
        passMarks: "",
        durationMinutes: "30",
        mcqDurationMinutes: "",
        startsAt: `${tomorrow}T09:00`,
        endsAt: `${tomorrow}T11:00`,
        maxAttempts: "1",
        shuffleQuestions: false,
        shuffleOptions: false,
        resultsRelease: "after_close",
        resultPolicy: "best",
        revealAnswers: true,
        allowResubmission: false,
      }}
    />
  );
}

export default function NewExamPage({ searchParams }: PageProps<"/teacher/exams/new">) {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Exams", href: "/teacher/exams" }, { label: "New exam" }]} title="New exam" description="Configure the exam, then add questions." />
      <Suspense fallback={<FormSkeleton fields={8} />}>
        <NewExam searchParams={searchParams as Promise<{ course?: string }>} />
      </Suspense>
    </>
  );
}
