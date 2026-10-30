import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/dal";
import { noteTaxonomy } from "@/features/notes/queries";
import { NoteForm } from "@/features/notes/components/note-form";

export const metadata: Metadata = { title: "New Resource" };

async function NewNote({ searchParams }: { searchParams: Promise<{ subject?: string; chapter?: string }> }) {
  const [{ subject, chapter }, { profile, supabase }] = await Promise.all([searchParams, requireStudent()]);
  const taxonomy = await noteTaxonomy(supabase);
  return (
    <Card>
      <CardContent className="py-6">
        <NoteForm
          ownerId={profile.id}
          defaultValues={{ title: "", subject: subject?.slice(0, 100) ?? "", chapter: chapter?.slice(0, 150) ?? "", body: "", tags: "" }}
          suggestions={{
            subjects: taxonomy.subjects.map((s) => s.name).filter(Boolean),
            chapters: [...new Set(taxonomy.subjects.flatMap((s) => s.chapters.map((c) => c.name)).filter(Boolean))],
          }}
        />
      </CardContent>
    </Card>
  );
}

export default function NewNotePage({ searchParams }: PageProps<"/student/notes/new">) {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Resources", href: "/student/notes" }, { label: "New resource" }]}
        title="New Resource"
        description="Create a revision note or folder for your lecture photos and PDF study materials."
      />
      <Suspense fallback={<FormSkeleton fields={5} />}>
        <NewNote searchParams={searchParams as Promise<{ subject?: string; chapter?: string }>} />
      </Suspense>
    </>
  );
}
