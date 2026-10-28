import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/dal";
import { noteTaxonomy } from "@/features/notes/queries";
import { NoteForm } from "@/features/notes/components/note-form";

export const metadata: Metadata = { title: "New note" };

async function NewNote({ searchParams }: { searchParams: Promise<{ subject?: string; chapter?: string }> }) {
  const [{ subject, chapter }, { supabase }] = await Promise.all([searchParams, requireStudent()]);
  const taxonomy = await noteTaxonomy(supabase);
  return (
    <Card>
      <CardContent className="py-6">
        <NoteForm
          defaultValues={{ title: "", subject: subject?.slice(0, 100) ?? "", chapter: chapter?.slice(0, 150) ?? "", body: "", tags: "" }}
          suggestions={{
            subjects: taxonomy.subjects.map((s) => s.name).filter(Boolean),
            chapters: [...new Set(taxonomy.subjects.flatMap((s) => s.chapters.map((c) => c.name)).filter(Boolean))],
          }}
        />
        <p className="mt-4 text-xs text-muted-foreground">You can add images and PDFs after creating the note.</p>
      </CardContent>
    </Card>
  );
}

export default function NewNotePage({ searchParams }: PageProps<"/student/notes/new">) {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Notes", href: "/student/notes" }, { label: "New note" }]} title="New note" />
      <Suspense fallback={<FormSkeleton fields={5} />}>
        <NewNote searchParams={searchParams as Promise<{ subject?: string; chapter?: string }>} />
      </Suspense>
    </>
  );
}
