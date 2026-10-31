import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, ClipboardCheck, FileText, Plus, Radio, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatCardsSkeleton } from "@/components/shared/stat-card";
import { TableSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { listTeacherExams } from "@/features/exams/queries";
import { listAttempts, listAttemptsPage } from "@/features/grading/queries";
import { PHASE_META, examPhase } from "@/features/exams/status";
import { notifyReleasedResults } from "@/features/notifications/send";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard() {
  const { profile, supabase } = await requireTeacher();
  const [exams, toGrade, recentPage, courses, students] = await Promise.all([
    listTeacherExams(supabase),
    listAttempts(supabase, { needsGrading: true }),
    listAttemptsPage(supabase, { submittedOnly: true }, 1, 6),
    supabase.from("courses").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("course_members").select("student_id").eq("status", "active"),
  ]);
  const now = requestTime();
  const tz = profile.timezone;
  const withPhase = exams.map((e) => ({ ...e, phase: examPhase({ status: e.status, starts_at: e.startsAt, ends_at: e.endsAt }, now) }));
  const live = withPhase.filter((e) => e.phase === "live");
  const upcoming = withPhase.filter((e) => e.phase === "scheduled" || e.phase === "live").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
  const recent = recentPage.rows;
  // Results released by time alone (an "after close" window ending) are emailed from here.
  await notifyReleasedResults(supabase, null);
  const uniqueStudents = new Set((students.data ?? []).map((s) => s.student_id)).size;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active courses" value={courses.count ?? 0} icon={BookOpen} />
        <StatCard label="Enrolled students" value={uniqueStudents} icon={Users} tone="info" />
        <StatCard label="Live exams" value={live.length} hint={<T vars={{ n: live.reduce((s, e) => s + e.attemptCount, 0) }}>{"{n} attempts so far"}</T>} icon={Radio} tone="success" />
        <StatCard label="Awaiting grading" value={toGrade.length} icon={ClipboardCheck} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle><T>Live and upcoming exams</T></CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/teacher/exams"><T>All exams</T></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nothing scheduled"
                className="py-8"
                action={
                  <Button asChild size="sm">
                    <Link href="/teacher/exams/new">
                      <Plus aria-hidden /> <T>New exam</T>
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/teacher/exams/${e.id}`} className="block truncate font-medium hover:underline">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {e.courseTitle} · {formatDateTime(e.startsAt, tz)}
                      </p>
                    </div>
                    <Badge tone={PHASE_META[e.phase].tone}>{PHASE_META[e.phase].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle><T>Recent submissions</T></CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/teacher/grading"><T>Grading queue</T></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No submissions yet" className="py-8" />
            ) : (
              <ul className="divide-y">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/teacher/attempts/${a.id}`} className="block truncate font-medium hover:underline">
                        {a.studentName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.examTitle} · {formatDateTime(a.submittedAt, tz)}
                      </p>
                    </div>
                    {a.gradingStatus === "graded" ? (
                      <span className="text-sm tabular-nums">{a.percentage}%</span>
                    ) : (
                      <Badge tone="warning"><T>Needs grading</T></Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function TeacherDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of your courses, exams and grading."
        actions={
          <Button asChild>
            <Link href="/teacher/exams/new">
              <Plus aria-hidden /> <T>New exam</T>
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-6">
            <StatCardsSkeleton />
            <div className="grid gap-6 lg:grid-cols-2">
              <TableSkeleton rows={4} columns={2} />
              <TableSkeleton rows={4} columns={2} />
            </div>
          </div>
        }
      >
        <Dashboard />
      </Suspense>
    </>
  );
}
