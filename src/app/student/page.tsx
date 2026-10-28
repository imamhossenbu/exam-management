import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import type { Metadata } from "next";
import { GraduationCap, NotebookPen, Radio, Ticket, Trophy } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatCardsSkeleton } from "@/components/shared/stat-card";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { listStudentCourses, listStudentExams } from "@/features/attempts/queries";
import { listStudentResults } from "@/features/attempts/result-queries";
import { StudentExamList } from "@/features/attempts/components/student-exam-list";
import { examPhase } from "@/features/exams/status";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard() {
  const { profile, supabase } = await requireStudent();
  const [courses, exams, results, notes] = await Promise.all([
    listStudentCourses(supabase, profile.id),
    listStudentExams(supabase, profile.id),
    listStudentResults(supabase, profile.id),
    supabase.from("study_notes").select("id", { count: "exact", head: true }),
  ]);
  const now = requestTime();
  const tz = profile.timezone;

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title={`Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!`}
        description="Join your course with the invitation code from your teacher to see exams and results."
        action={
          <Button asChild>
            <Link href="/student/join">Join a course</Link>
          </Button>
        }
      />
    );
  }

  const active = exams.filter((e) => {
    const p = examPhase({ status: e.status, starts_at: e.startsAt, ends_at: e.endsAt }, now);
    return p === "live" || p === "scheduled";
  });
  active.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const released = results.filter((r) => r.released);
  const avg = released.length ? Math.round((released.reduce((s, r) => s + (r.percentage ?? 0), 0) / released.length) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My courses" value={courses.length} icon={GraduationCap} />
        <StatCard label="Live or upcoming exams" value={active.length} icon={Radio} tone="success" />
        <StatCard label="Average score" value={avg === null ? "—" : `${avg}%`} hint={`${released.length} released result(s)`} icon={Trophy} tone="warning" />
        <StatCard label="Notes" value={notes.count ?? 0} icon={NotebookPen} tone="info" />
      </div>
      <section>
        <h2 className="section-title mb-3">Live and upcoming exams</h2>
        <StudentExamList exams={active.slice(0, 6)} timezone={tz} now={now} />
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent results</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/student/results">All results</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-subtle">No submissions yet.</p>
          ) : (
            <ul className="divide-y">
              {results.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/student/attempts/${r.id}/result`} className="block truncate font-medium hover:underline">
                      {r.examTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.courseTitle} · {formatDateTime(r.submittedAt, tz)}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">{r.released ? `${r.score}/${r.maxScore}` : <span className="text-muted-foreground">Pending</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function StudentDashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your exams, results and notes at a glance." />
      <Suspense
        fallback={
          <div className="space-y-6">
            <StatCardsSkeleton />
            <CardGridSkeleton count={2} />
          </div>
        }
      >
        <Dashboard />
      </Suspense>
    </>
  );
}
