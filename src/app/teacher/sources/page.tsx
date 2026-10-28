import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { requireTeacher } from "@/lib/auth/dal";
import { listSources } from "@/features/sources/queries";
import { SourcesTable } from "@/features/sources/components/sources-table";

export const metadata: Metadata = { title: "Question sources" };

async function Sources() {
  const { profile, supabase } = await requireTeacher();
  const sources = await listSources(supabase);
  return <SourcesTable sources={sources} timezone={profile.timezone} />;
}

export default function SourcesPage() {
  return (
    <>
      <PageHeader title="Question sources" description="Original PDFs and images you've uploaded for importing questions. Only you can access them." />
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <Sources />
      </Suspense>
    </>
  );
}
