import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils/datetime";
import { uuid } from "@/lib/validations/courses";
import { getNote, noteTaxonomy } from "@/features/notes/queries";
import { NoteForm } from "@/features/notes/components/note-form";
import { NoteAttachments } from "@/features/notes/components/note-attachments";

async function NoteContent({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  if (!uuid.safeParse(noteId).success) notFound();
  const { profile, supabase } = await requireStudent();
  const [note, taxonomy] = await Promise.all([getNote(supabase, noteId), noteTaxonomy(supabase)]);
  if (!note) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Notes", href: "/student/notes" }, ...(note.subject ? [{ label: note.subject, href: `/student/notes?subject=${encodeURIComponent(note.subject)}` }] : []), { label: note.title }]}
        title={note.title}
        description={`Last updated ${formatDateTime(note.updated_at, profile.timezone)}`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="py-6">
            <NoteForm
              key={note.updated_at}
              noteId={note.id}
              defaultValues={{ title: note.title, subject: note.subject, chapter: note.chapter, body: note.body, tags: note.tags.join(", ") }}
              suggestions={{
                subjects: taxonomy.subjects.map((s) => s.name).filter(Boolean),
                chapters: [...new Set(taxonomy.subjects.flatMap((s) => s.chapters.map((c) => c.name)).filter(Boolean))],
              }}
            />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteAttachments noteId={note.id} ownerId={profile.id} files={note.files} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function NotePage({ params }: PageProps<"/student/notes/[noteId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <FormSkeleton fields={5} />
        </>
      }
    >
      <NoteContent params={params} />
    </Suspense>
  );
}
