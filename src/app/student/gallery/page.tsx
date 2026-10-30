import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { requireStudent } from "@/lib/auth/dal";
import { getGalleryTaxonomy, listGalleryImages } from "@/features/gallery/queries";
import { GalleryView } from "@/features/gallery/components/gallery-view";

export const metadata: Metadata = { title: "Study Gallery" };

async function GalleryContent() {
  const { profile, supabase } = await requireStudent();
  const [photos, subjects] = await Promise.all([
    listGalleryImages(supabase),
    getGalleryTaxonomy(supabase),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Gallery" }]}
        title="Study Photo Gallery"
        description="Upload and browse your whiteboard photos, lecture slides, formulas, and study diagrams."
      />
      <GalleryView
        photos={photos}
        ownerId={profile.id}
        subjects={subjects}
        timezone={profile.timezone}
      />
    </>
  );
}

export default function GalleryPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton />
          <CardGridSkeleton count={8} />
        </>
      }
    >
      <GalleryContent />
    </Suspense>
  );
}
