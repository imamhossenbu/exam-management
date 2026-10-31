import { Suspense } from "react";
import { requestTime } from "@/lib/utils/now";
import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, FileStack, FileText, GraduationCap, Plus, Radio, Ticket, Trophy } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireStudent } from "@/lib/auth/dal";
import { formatDate, formatDateTime } from "@/lib/utils/datetime";
import { listStudentCourses, listStudentExams } from "@/features/attempts/queries";
import { listStudentResults } from "@/features/attempts/result-queries";
import { listNotes } from "@/features/notes/queries";
import { StudentExamList } from "@/features/attempts/components/student-exam-list";
import { examPhase } from "@/features/exams/status";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard() {
  const { profile, supabase } = await requireStudent();
  const [courses, exams, results, notes, noteList] = await Promise.all([
    listStudentCourses(supabase, profile.id),
    listStudentExams(supabase, profile.id),
    listStudentResults(supabase, profile.id),
    supabase.from("study_notes").select("id", { count: "exact", head: true }),
    listNotes(supabase, {}),
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
            <Link href="/student/join"><T>Join a course</T></Link>
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
  // One result per exam: the counted attempt (best or latest, per exam setting).
  const released = results.filter((r) => r.released && r.counted);
  const avg = released.length ? Math.round((released.reduce((s, r) => s + (r.percentage ?? 0), 0) / released.length) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My courses" value={courses.length} icon={GraduationCap} />
        <StatCard label="Live or upcoming exams" value={active.length} icon={Radio} tone="success" />
        <StatCard label="Average score" value={avg === null ? "—" : `${avg}%`} hint={`${released.length} released result(s)`} icon={Trophy} tone="warning" />
        <StatCard label="Resources" value={notes.count ?? 0} icon={FileStack} tone="info" hint="PDFs & study notes" />
      </div>

      {/* Live and upcoming exams */}
      <section>
        <h2 className="section-title mb-3"><T>Live and upcoming exams</T></h2>
        <StudentExamList exams={active.slice(0, 6)} timezone={tz} now={now} />
      </section>

      {/* My Study Resources & Notebooks Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title"><T>Study Resources & Materials</T></h2>
            <p className="text-xs text-muted-foreground"><T>Your PDF guides, lecture slides, and multi-page notebooks.</T></p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
              <Link href="/student/notes/new">
                <Plus className="size-3.5" /> <T>Add Resource</T>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/student/notes"><T>View all</T></Link>
            </Button>
          </div>
        </div>

        {noteList.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-muted/20">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3.5">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <FileStack className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground"><T>Upload your study materials</T></h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <T>Save PDFs or multi-page photos of your lecture notes to read sequentially like a notebook.</T>
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="gap-1.5 shrink-0">
                <Link href="/student/notes/new">
                  <Plus className="size-3.5" /> <T>Upload Now</T>
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {noteList.slice(0, 3).map((item) => (
              <Link
                key={item.id}
                href={`/student/notes/${item.id}`}
                className="group relative flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card hover:bg-surface hover:shadow-card hover:border-primary/40 transition-all focus-ring"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {item.subject || "Resource"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatDate(item.updated_at, tz)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mt-1 line-clamp-1">
                    {item.title}
                  </h3>
                  {item.chapter && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.chapter}
                    </p>
                  )}
                  {item.excerpt && (
                    <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2 leading-relaxed">
                      {item.excerpt}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-2.5 border-t border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    {item.pdfCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-semibold">
                        <FileText className="size-3" /> {item.pdfCount} PDF
                      </span>
                    )}
                    {item.imageCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
                        <BookOpen className="size-3" /> {item.imageCount}p
                      </span>
                    )}
                    {item.pdfCount === 0 && item.imageCount === 0 && (
                      <Badge tone="neutral" className="text-[10px]"><T>Note</T></Badge>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Read →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent results */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle><T>Recent results</T></CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/student/results"><T>All results</T></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-subtle"><T>No submissions yet.</T></p>
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
                  <span className="text-sm tabular-nums">{r.released ? `${r.score}/${r.maxScore}` : <span className="text-muted-foreground"><T>Pending</T></span>}</span>
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
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
