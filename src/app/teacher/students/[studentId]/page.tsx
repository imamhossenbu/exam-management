import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/lib/auth/dal";
import { formatDate, formatDateTime } from "@/lib/utils/datetime";
import { getStudentDetail } from "@/features/students/queries";
import { GRADING_META } from "@/features/exams/status";
import { uuid } from "@/lib/validations/courses";

const MEMBER_TONE = { active: "success", suspended: "warning", removed: "neutral" } as const;

async function StudentDetail({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!uuid.safeParse(studentId).success) notFound();
  const { profile: me, supabase } = await requireTeacher();
  const detail = await getStudentDetail(supabase, studentId);
  if (!detail) notFound();
  const { profile, memberships, attempts } = detail;
  const tz = me.timezone;
  const graded = attempts.filter((a) => a.result?.grading_status === "graded");
  const average = graded.length ? graded.reduce((s, a) => s + Number(a.result?.percentage ?? 0), 0) / graded.length : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Students", href: "/teacher/students" }, { label: profile.full_name || "Student" }]}
        title={profile.full_name || "Unnamed student"}
        description={`${profile.email ?? ""} · Signed up ${formatDate(profile.created_at, tz)}`}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="text-subtle">Active courses</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{memberships.filter((m) => m.status === "active").length}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle">Exam attempts</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{attempts.length}</p>
        </div>
        <div className="surface p-3.5">
          <p className="text-subtle">Average score</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{average === null ? "—" : `${average.toFixed(1)}%`}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Enrollments</CardTitle>
          </CardHeader>
          <CardContent>
            {memberships.length === 0 ? (
              <EmptyState icon={BookOpen} title="Not enrolled" description="This student hasn't joined any of your courses." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div>
                      <Link href={`/teacher/courses/${m.course?.id}`} className="font-medium hover:underline">
                        {m.course?.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">Joined {formatDate(m.joined_at, tz)}</p>
                    </div>
                    <Badge tone={MEMBER_TONE[m.status]} className="capitalize">
                      {m.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Change enrollment status from the course&apos;s Students tab.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Result history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attempts.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={FileText} title="No attempts yet" className="py-6" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Exam</th>
                      <th scope="col" className="px-4 py-2 font-medium">Submitted</th>
                      <th scope="col" className="px-4 py-2 font-medium">Score</th>
                      <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => {
                      const meta = a.result ? GRADING_META[a.result.grading_status] : null;
                      return (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <Link href={`/teacher/attempts/${a.id}`} className="font-medium hover:underline">
                              {a.exam?.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {a.exam?.course?.title} · Attempt {a.attempt_number}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{a.status === "in_progress" ? "In progress" : formatDateTime(a.submitted_at, tz)}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {a.result ? `${Number(a.result.total_score)} / ${Number(a.result.max_score)} (${Number(a.result.percentage)}%)` : "—"}
                          </td>
                          <td className="px-4 py-3">{meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : <Badge>In progress</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function StudentDetailPage({ params }: PageProps<"/teacher/students/[studentId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </>
      }
    >
      <StudentDetail params={params} />
    </Suspense>
  );
}
