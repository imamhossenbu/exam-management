import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { GraduationCap, Ticket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/dal";
import { formatDate } from "@/lib/utils/datetime";
import { listStudentCourses } from "@/features/attempts/queries";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "My courses" };

async function Courses() {
  const { profile, supabase } = await requireStudent();
  const courses = await listStudentCourses(supabase, profile.id);
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="You haven't joined a course yet"
        description="Ask your teacher for an invitation code."
        action={
          <Button asChild>
            <Link href="/student/join">
              <Ticket aria-hidden /> <T>Join a course</T>
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <li key={c.id}>
          <Link href={`/student/courses/${c.id}`} className="surface block h-full p-5 surface-interactive focus-ring">
            <div className="flex items-start justify-between gap-2">
              <h2 className="section-title">{c.title}</h2>
              {c.code ? <Badge>{c.code}</Badge> : null}
            </div>
            {c.description ? <p className="text-subtle mt-2 line-clamp-3">{c.description}</p> : null}
            <p className="mt-4 text-xs text-muted-foreground">
              {c.examCount} exam{c.examCount === 1 ? "" : "s"} · Joined {formatDate(c.joinedAt, profile.timezone)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function StudentCoursesPage() {
  return (
    <>
      <PageHeader
        title="My courses"
        actions={
          <Button asChild variant="outline">
            <Link href="/student/join">
              <Ticket aria-hidden /> <T>Join a course</T>
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<CardGridSkeleton count={3} />}>
        <Courses />
      </Suspense>
    </>
  );
}
