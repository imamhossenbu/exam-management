import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Award, BarChart3, ClipboardList, Download, Hourglass, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatCardsSkeleton } from "@/components/shared/stat-card";
import { TableSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { requireTeacher } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { localDayBounds } from "@/lib/utils/datetime";
import { listAttemptsPage } from "@/features/grading/queries";
import { parseOverview } from "@/features/grading/analytics";
import { AttemptsTable } from "@/features/grading/components/attempts-table";
import { ExamAverageChart } from "@/features/grading/components/exam-average-chart";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Results" };

type Filters = { course?: string; exam?: string; from?: string; to?: string; page?: string };
const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function Results({ searchParams }: { searchParams: Promise<Filters> }) {
  const raw = await searchParams;
  const f = {
    course: raw.course && uuid.safeParse(raw.course).success ? raw.course : "",
    exam: raw.exam && uuid.safeParse(raw.exam).success ? raw.exam : "",
    from: raw.from && DATE.test(raw.from) ? raw.from : "",
    to: raw.to && DATE.test(raw.to) ? raw.to : "",
  };
  const { profile, supabase } = await requireTeacher();
  const page = Math.max(1, Number(raw.page) || 1);
  const bounds = localDayBounds(f.from, f.to, profile.timezone);
  const filter = { examId: f.exam || undefined, courseId: f.course || undefined, submittedOnly: true, from: bounds.from, to: bounds.to };
  const [overviewRes, attemptsPage, { data: courses }, { data: exams }] = await Promise.all([
    supabase.rpc("results_overview", { p_course_id: f.course || undefined, p_exam_id: f.exam || undefined, p_from: bounds.from ?? undefined, p_to: bounds.to ?? undefined }),
    listAttemptsPage(supabase, filter, page, PAGE_SIZE),
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("exams").select("id, title, course_id").neq("status", "draft").order("starts_at", { ascending: false }),
  ]);
  if (overviewRes.error) throw overviewRes.error;
  const overview = parseOverview(overviewRes.data);
  const summaries = overview.exams;
  const trends = overview.students;
  const rows = attemptsPage.rows;
  const avg = overview.average;
  const passRate = overview.passRate;
  const filterParams = Object.entries({ examId: f.exam, courseId: f.course, from: f.from, to: f.to }).filter(([, v]) => v);
  const csvParams = new URLSearchParams(filterParams);
  const pageHref = (n: number) =>
    `/teacher/results?${new URLSearchParams([...Object.entries({ course: f.course, exam: f.exam, from: f.from, to: f.to }).filter(([, v]) => v), ["page", String(n)]]).toString()}`;
  const lastPage = Math.max(1, Math.ceil(attemptsPage.total / PAGE_SIZE));
  const examOptions = (exams ?? []).filter((e) => !f.course || e.course_id === f.course);

  return (
    <div className="space-y-6">
      <form method="get" className="surface flex flex-col gap-3 p-4 md:flex-row md:items-end" aria-label="Filter results">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="course"><T>Course</T></Label>
          <NativeSelect id="course" name="course" defaultValue={f.course}>
            <option value="">All courses</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="exam"><T>Exam</T></Label>
          <NativeSelect id="exam" name="exam" defaultValue={f.exam}>
            <option value="">All exams</option>
            {examOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from"><T>Submitted from</T></Label>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to"><T>to</T></Label>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </div>
        <div className="flex gap-2">
          <Button type="submit"><T>Apply</T></Button>
          <Button asChild variant="ghost">
            <Link href="/teacher/results"><T>Reset</T></Link>
          </Button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Submitted attempts" value={overview.submitted} hint={`${overview.counted} counted (one per student and exam)`} icon={ClipboardList} />
        <StatCard label="Awaiting grading" value={overview.pending} hint="Counted attempts not fully graded" icon={Hourglass} tone="warning" />
        <StatCard label="Average score" value={avg === null ? "—" : `${avg}%`} hint="Counted, fully graded attempts" icon={BarChart3} tone="info" />
        <StatCard label="Pass rate" value={passRate === null ? "—" : `${passRate}%`} hint="Exams with a pass mark" icon={Award} tone="success" />
      </div>

      {overview.submitted === 0 ? (
        <EmptyState icon={BarChart3} title="No results for this selection" description="Results appear once students submit attempts." />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle><T>Average score by exam</T></CardTitle>
              </CardHeader>
              <CardContent>
                <ExamAverageChart summaries={summaries} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle><T>Student performance trends</T></CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b bg-surface text-left text-xs text-muted-foreground uppercase">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium"><T>Student</T></th>
                        <th scope="col" className="px-4 py-2 font-medium"><T>Average</T></th>
                        <th scope="col" className="px-4 py-2 font-medium"><T>Recent (oldest → newest)</T></th>
                        <th scope="col" className="px-4 py-2 font-medium"><T>Trend</T></th>
                      </tr>
                    </thead>
                    <tbody>
                      {trends.map((t) => (
                        <tr key={t.studentId} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <Link href={`/teacher/students/${t.studentId}`} className="hover:underline">
                              {t.studentName}
                            </Link>
                          </td>
                          <td className="px-4 py-2 tabular-nums">{t.average}%</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">{t.recent.map((p) => `${p}%`).join(" → ")}</td>
                          <td className="px-4 py-2">
                            {t.change === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                {t.change >= 0 ? <TrendingUp className="size-4 text-success" aria-hidden /> : <TrendingDown className="size-4 text-danger" aria-hidden />}
                                {t.change > 0 ? "+" : ""}
                                {t.change} pts
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle><T>Exam summaries</T></CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    {["Exam", "Graded", "Pending", "Average", "Highest", "Lowest", "Pass rate"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.examId} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/teacher/exams/${s.examId}/attempts`} className="font-medium hover:underline">
                          {s.examTitle}
                        </Link>
                        <p className="text-xs text-muted-foreground">{s.courseTitle}</p>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{s.graded}</td>
                      <td className="px-4 py-2 tabular-nums">{s.pending}</td>
                      <td className="px-4 py-2 tabular-nums">{s.average === null ? "—" : `${s.average}%`}</td>
                      <td className="px-4 py-2 tabular-nums">{s.highest === null ? "—" : `${s.highest}%`}</td>
                      <td className="px-4 py-2 tabular-nums">{s.lowest === null ? "—" : `${s.lowest}%`}</td>
                      <td className="px-4 py-2 tabular-nums">{s.passRate === null ? "—" : `${s.passRate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div>
            <h2 className="section-title mb-3"><T>All attempts</T></h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Showing {attemptsPage.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, attemptsPage.total)} of {attemptsPage.total}. Search and
              filters in the table apply to this page; use the filters above for the whole list.
            </p>
            <AttemptsTable
              attempts={rows}
              timezone={profile.timezone}
              pageSize={PAGE_SIZE}
              toolbar={
                <Button asChild variant="outline">
                  <a href={`/api/results?${csvParams.toString()}`} download>
                    <Download aria-hidden /> <T>Export CSV</T>
                  </a>
                </Button>
              }
            />
            {lastPage > 1 ? (
              <nav aria-label="Attempt pages" className="mt-3 flex items-center justify-between gap-2 text-sm">
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(page - 1)}><T>Previous page</T></Link>
                  </Button>
                ) : (
                  <span />
                )}
                <span className="text-muted-foreground tabular-nums">
                  Page {page} of {lastPage}
                </span>
                {page < lastPage ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(page + 1)}><T>Next page</T></Link>
                  </Button>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function ResultsPage({ searchParams }: PageProps<"/teacher/results">) {
  return (
    <>
      <PageHeader title="Results" description="Scores, trends and exports across your courses. Averages use each student\u2019s counted attempt (best or latest, per exam) once fully graded." />
      <Suspense
        fallback={
          <div className="space-y-6">
            <StatCardsSkeleton />
            <TableSkeleton columns={6} />
          </div>
        }
      >
        <Results searchParams={searchParams as Promise<Filters>} />
      </Suspense>
    </>
  );
}
