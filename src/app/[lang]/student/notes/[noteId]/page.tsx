import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { requireStudent } from "@/lib/auth/dal";
import { uuid } from "@/lib/validations/courses";
import { getNote, noteTaxonomy } from "@/features/notes/queries";
import { ResourceReader } from "@/features/notes/components/resource-reader";
import { getFormatters, getRouteT } from "@/lib/i18n/route";

async function NoteContent({ params }: { params: Promise<{ noteId: string }> }) {
  const [t, f] = await Promise.all([getRouteT(), getFormatters()]);
  const { noteId } = await params;
  if (!uuid.safeParse(noteId).success) notFound();
  const { profile, supabase } = await requireStudent();
  const [note, taxonomy] = await Promise.all([getNote(supabase, noteId), noteTaxonomy(supabase)]);
  if (!note) notFound();

  const pdfCount = note.files.filter((f) => f.mimeType === "application/pdf").length;
  const imageCount = note.files.filter((f) => f.mimeType.startsWith("image/")).length;

  const typeDesc = [
    pdfCount > 0 ? `${pdfCount} PDF${pdfCount > 1 ? "s" : ""}` : null,
    imageCount > 0 ? `${imageCount} image page${imageCount > 1 ? "s" : ""}` : null,
    t("Updated {when}", { when: f.dateTime(note.updated_at, profile.timezone) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Resources", href: "/student/notes" },
          ...(note.subject ? [{ label: note.subject, href: `/student/notes?subject=${encodeURIComponent(note.subject)}` }] : []),
          { label: note.title },
        ]}
        title={note.title}
        description={typeDesc}
      />
      <ResourceReader note={note} ownerId={profile.id} taxonomy={taxonomy} />
    </>
  );
}

export default function NotePage({ params }: PageProps<"/[lang]/student/notes/[noteId]">) {
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
