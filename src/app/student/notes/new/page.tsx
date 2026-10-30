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
        <div className="mt-5 p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">💡 Pro tip:</span>
          Once created, you can immediately upload multi-page lecture photos to read sequentially as a notebook, or attach PDF documents to read directly in the study reader.
        </div>
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
