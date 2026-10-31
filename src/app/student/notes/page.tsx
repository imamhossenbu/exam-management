import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, FileStack, FileText, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardGridSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireStudent } from "@/lib/auth/dal";
import { formatDate } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils/cn";
import { listNotes, noteTaxonomy, type NoteFilters } from "@/features/notes/queries";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Study Resources" };

function href(f: NoteFilters) {
  const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `/student/notes?${s}` : "/student/notes";
}

async function Notes({ searchParams }: { searchParams: Promise<NoteFilters> }) {
  const raw = await searchParams;
  const filters: NoteFilters = {
    q: raw.q?.slice(0, 200) || undefined,
    subject: raw.subject?.slice(0, 100) || undefined,
    chapter: raw.chapter?.slice(0, 150) || undefined,
    tag: raw.tag?.slice(0, 40) || undefined,
  };
  const { profile, supabase } = await requireStudent();
  const [notes, taxonomy] = await Promise.all([listNotes(supabase, filters), noteTaxonomy(supabase)]);
  const filtered = Boolean(filters.q || filters.subject || filters.chapter || filters.tag);

  if (!filtered && notes.length === 0) {
    return (
      <EmptyState
        icon={FileStack}
        title="Upload your first study resource"
        description="Save your PDF guides, multi-page lecture notes, and revision summaries. Read and study them anytime."
        action={
          <Button asChild>
            <Link href="/student/notes/new">
              <Plus aria-hidden /> <T>New resource</T>
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="space-y-5" aria-label="Organise resources">
        <nav aria-label="Subjects and chapters">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"><T>Subjects</T></p>
          <ul className="space-y-0.5 text-sm">
            <li>
              <Link href={href({ q: filters.q })} className={cn("flex justify-between rounded-md px-2 py-1 hover:bg-muted", !filters.subject && "bg-muted font-medium")}>
                <T>All resources</T>
              </Link>
            </li>
            {taxonomy.subjects.map((s) => (
              <li key={s.name || "none"}>
                <Link
                  href={href({ q: filters.q, subject: s.name || undefined })}
                  className={cn("flex justify-between rounded-md px-2 py-1 hover:bg-muted", filters.subject === s.name && !filters.chapter && "bg-muted font-medium")}
                >
                  <span className="truncate">{s.name || "No subject"}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                </Link>
                {filters.subject === s.name && s.name ? (
                  <ul className="ml-3 border-l pl-2">
                    {s.chapters.map((c) => (
                      <li key={c.name || "none"}>
                        <Link
                          href={href({ q: filters.q, subject: s.name, chapter: c.name || undefined })}
                          className={cn("flex justify-between rounded-md px-2 py-1 text-xs hover:bg-muted", filters.chapter === c.name && "bg-muted font-medium")}
                        >
                          <span className="truncate">{c.name || "No chapter"}</span>
                          <span className="tabular-nums">{c.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        {taxonomy.tags.length ? (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"><T>Tags</T></p>
            <div className="flex flex-wrap gap-1.5">
              {taxonomy.tags.slice(0, 30).map((t) => (
                <Link key={t.name} href={href({ ...filters, tag: filters.tag === t.name ? undefined : t.name })}>
                  <Badge tone={filters.tag === t.name ? "primary" : "neutral"}>#{t.name}</Badge>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <section className="min-w-0 space-y-4">
        <form method="get" role="search" className="flex gap-2">
          {filters.subject ? <input type="hidden" name="subject" value={filters.subject} /> : null}
          {filters.chapter ? <input type="hidden" name="chapter" value={filters.chapter} /> : null}
          {filters.tag ? <input type="hidden" name="tag" value={filters.tag} /> : null}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={filters.q} placeholder="Search your resources & notes…" aria-label="Search resources" className="pl-8" />
          </div>
          <Button type="submit" variant="outline">
            <T>Search</T>
          </Button>
        </form>
        {filtered ? (
          <p className="text-sm text-muted-foreground">
            {notes.length} resource{notes.length === 1 ? "" : "s"} found ·{" "}
            <Link href="/student/notes" className="text-primary hover:underline">
              <T>Clear filters</T>
            </Link>
          </p>
        ) : null}
        {notes.length === 0 ? (
          <EmptyState icon={Search} title="No matching resources" description="Try different words or clear the filters." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={`/student/notes/${n.id}`} className="surface block h-full p-4 surface-interactive focus-ring rounded-xl border transition-all hover:shadow-card group">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {n.title}
                    </h2>
                    <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
                      {formatDate(n.updated_at, profile.timezone)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-medium">
                    {[n.subject, n.chapter].filter(Boolean).join(" › ") || "Unsorted"}
                  </p>
                  {n.excerpt ? <p className="text-xs text-muted-foreground/90 mt-2 line-clamp-2 leading-relaxed">{n.excerpt}</p> : null}
                  
                  <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                    {/* File type badges */}
                    {n.pdfCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">
                        <FileText className="size-3" /> {n.pdfCount} PDF{n.pdfCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {n.imageCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
                        <BookOpen className="size-3" /> {n.imageCount} image page{n.imageCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {n.tags.slice(0, 3).map((t) => (
                      <Badge key={t} tone="neutral" className="text-[10px]">#{t}</Badge>
                    ))}
                    
                    <span className="ml-auto text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Read & Study →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function NotesPage({ searchParams }: PageProps<"/student/notes">) {
  return (
    <>
      <PageHeader
        title="Study Resources"
        description="Upload and organize your lecture notes, multi-page slide photos, and PDF study documents."
        actions={
          <Button asChild>
            <Link href="/student/notes/new">
              <Plus aria-hidden /> <T>New resource</T>
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<CardGridSkeleton count={6} />}>
        <Notes searchParams={searchParams as Promise<NoteFilters>} />
      </Suspense>
    </>
  );
}
