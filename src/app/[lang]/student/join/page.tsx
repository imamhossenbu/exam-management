import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { JoinCourseForm } from "@/features/courses/components/join-course-form";

export const metadata: Metadata = { title: "Join a course" };

export default function JoinPage() {
  return (
    <>
      <PageHeader title="Join a course" description="Enter the invitation code your teacher gave you." />
      <Card className="max-w-md">
        <CardContent className="py-6">
          <JoinCourseForm />
        </CardContent>
      </Card>
    </>
  );
}
