import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStudent } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { getAttemptForTaking } from "@/features/attempts/queries";
import { ExamRunner } from "@/features/attempts/components/exam-runner";

export const metadata: Metadata = { title: "Exam in progress" };

async function Attempt({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!uuid.safeParse(attemptId).success) notFound();
  const { profile, supabase } = await requireStudent();
  let data = await getAttemptForTaking(supabase, attemptId, profile.id);
  if (!data) notFound();
  const serverNow = requestTime();
  const { attempt } = data;

  if (attempt.status === "in_progress" && new Date(attempt.deadline_at).getTime() <= serverNow) {
    // Deadline passed while away: finalize on the server (idempotent) and show the result.
    await supabase.rpc("submit_attempt", { p_attempt_id: attempt.id });
    redirect(`/student/attempts/${attempt.id}/result`);
  }
  const returnedOpen = attempt.status === "returned" && (!attempt.resubmit_deadline_at || new Date(attempt.resubmit_deadline_at).getTime() > serverNow);
  if (attempt.status === "submitted" || (attempt.status === "returned" && !returnedOpen)) {
    redirect(`/student/attempts/${attempt.id}/result`);
  }
  data = data!;

  return (
    <ExamRunner
      attemptId={attempt.id}
      studentId={profile.id}
      examTitle={data.exam.title}
      instructions={data.exam.instructions}
      mode={attempt.status === "returned" ? "returned" : "in_progress"}
      returnNote={attempt.return_note}
      deadlineAt={attempt.status === "returned" ? (attempt.resubmit_deadline_at ?? attempt.deadline_at) : attempt.deadline_at}
      serverNow={new Date(serverNow).toISOString()}
      questions={data.questions}
      answers={data.answers}
      files={data.files}
    />
  );
}

function RunnerSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading exam">
      <div className="surface flex items-center justify-between p-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="surface space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="surface grid grid-cols-5 gap-1.5 p-4">
          {Array.from({ length: 15 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AttemptPage({ params }: PageProps<"/student/attempts/[attemptId]">) {
  return (
    <Suspense fallback={<RunnerSkeleton />}>
      <Attempt params={params} />
    </Suspense>
  );
}
