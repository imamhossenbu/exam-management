import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireTeacher } from "@/lib/auth/dal";
import { utcToZonedInput } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";
import { listCourseOptions } from "@/features/courses/queries";
import { getTeacherExam } from "@/features/exams/queries";
import { EXAM_TYPE_LABEL, PHASE_META, RELEASE_LABEL, examPhase } from "@/features/exams/status";
import { ExamLifecycleBar } from "@/features/exams/components/exam-lifecycle-bar";
import { ExamSettingsForm } from "@/features/exams/components/exam-settings-form";
import { QuestionBuilder } from "@/features/exams/components/question-builder";
import { DateTimeText, MinutesText, T } from "@/lib/i18n/client";
import { getFormatters } from "@/lib/i18n/route";

async function ExamDetail({ params }: { params: Promise<{ examId: string }> }) {
  const f = await getFormatters();
  const { examId } = await params;
  if (!uuid.safeParse(examId).success) notFound();
  const { profile, supabase } = await requireTeacher();
  const [detail, courses] = await Promise.all([getTeacherExam(supabase, examId), listCourseOptions(supabase)]);
  if (!detail) notFound();
  const { exam, questions, chapters, attemptCount, openAttemptCount } = detail;
  const tz = profile.timezone;
  const phase = examPhase(exam, requestTime());
  const editable = exam.status === "draft" && attemptCount === 0;
  const meta = PHASE_META[phase];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Exams", href: "/teacher/exams" },
          { label: exam.course?.title ?? "Course", href: `/teacher/courses/${exam.course_id}` },
          { label: exam.title },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {exam.title} <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        }
        description={
          <>
            <T>{EXAM_TYPE_LABEL[exam.exam_type]}</T> · <T vars={{ n: Number(exam.total_marks) }}>{"{n} marks"}</T> · <MinutesText minutes={exam.duration_minutes} />
            {exam.mcq_duration_minutes ? (
              <>
                {" "}
                <T vars={{ time: f.minutes(exam.mcq_duration_minutes) }}>{"(MCQ {time} first)"}</T>
              </>
            ) : null}{" "}
            · <DateTimeText iso={exam.starts_at} timeZone={tz} /> –{" "}
            <DateTimeText iso={exam.ends_at} timeZone={tz} withZone />
            {exam.subject ? ` · ${exam.subject.name}` : ""}
            {chapters.length ? ` (${chapters.map((c) => c.name).join(", ")})` : ""}
          </>
        }
        actions={
          <>
            {attemptCount > 0 ? (
              <Button asChild variant="outline">
                <Link href={`/teacher/exams/${exam.id}/attempts`}>
                  <Users aria-hidden /> <T vars={{ n: attemptCount }}>{"Attempts ({n})"}</T>
                </Link>
              </Button>
            ) : null}
            <ExamLifecycleBar
              examId={exam.id}
              phase={phase}
              attemptCount={attemptCount}
              openAttemptCount={openAttemptCount}
              resultsPublished={Boolean(exam.results_published_at)}
            />
          </>
        }
      />
      {phase !== "draft" ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {exam.results_published_at ? (
            <T vars={{ when: f.dateTime(exam.results_published_at, tz) }}>{"Results: published {when}."}</T>
          ) : (
            <>
              <T>Results:</T> <T>{RELEASE_LABEL[exam.results_release]}</T>
            </>
          )}
        </p>
      ) : null}
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="questions">
            <T vars={{ n: questions.length }}>{"Questions ({n})"}</T>
          </TabsTrigger>
          <TabsTrigger value="settings"><T>Settings</T></TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          <QuestionBuilder
            examId={exam.id}
            examType={exam.exam_type}
            totalMarks={Number(exam.total_marks)}
            questions={questions}
            editable={editable}
            published={exam.status !== "draft"}
          />
        </TabsContent>
        <TabsContent value="settings">
          <ExamSettingsForm
            examId={exam.id}
            courses={courses}
            timezone={tz}
            locked={!editable}
            defaultValues={{
              courseId: exam.course_id,
              subjectId: exam.subject_id ?? "",
              chapterIds: chapters.map((c) => c.id),
              title: exam.title,
              description: exam.description,
              instructions: exam.instructions,
              examType: exam.exam_type,
              totalMarks: String(exam.total_marks),
              passMarks: exam.pass_marks === null ? "" : String(exam.pass_marks),
              durationMinutes: String(exam.duration_minutes),
              mcqDurationMinutes: exam.mcq_duration_minutes === null ? "" : String(exam.mcq_duration_minutes),
              startsAt: utcToZonedInput(exam.starts_at, tz),
              endsAt: utcToZonedInput(exam.ends_at, tz),
              maxAttempts: String(exam.max_attempts),
              shuffleQuestions: exam.shuffle_questions,
              shuffleOptions: exam.shuffle_options,
              resultsRelease: exam.results_release,
              resultPolicy: exam.result_policy,
              revealAnswers: exam.reveal_answers,
              showMcqEarly: exam.show_mcq_early,
              allowResubmission: exam.allow_resubmission,
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function ExamDetailPage({ params }: PageProps<"/[lang]/teacher/exams/[examId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <ExamDetail params={params} />
    </Suspense>
  );
}
