import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { NotebookPen, Paperclip, Plus, Search } from "lucide-react";
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

export const metadata: Metadata = { title: "Notes" };

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
        icon={NotebookPen}
        title="Start your first note"
        description="Keep revision notes organised by subject and chapter. Notes are private to you."
        action={
          <Button asChild>
            <Link href="/student/notes/new">
              <Plus aria-hidden /> New note
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="space-y-5" aria-label="Organise notes">
        <nav aria-label="Subjects and chapters">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Subjects</p>
          <ul className="space-y-0.5 text-sm">
            <li>
              <Link href={href({ q: filters.q })} className={cn("flex justify-between rounded-md px-2 py-1 hover:bg-muted", !filters.subject && "bg-muted font-medium")}>
                All notes
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
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tags</p>
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
            <Input name="q" defaultValue={filters.q} placeholder="Search your notes…" aria-label="Search notes" className="pl-8" />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        {filtered ? (
          <p className="text-sm text-muted-foreground">
            {notes.length} note{notes.length === 1 ? "" : "s"} found ·{" "}
            <Link href="/student/notes" className="text-primary hover:underline">
              Clear filters
            </Link>
          </p>
        ) : null}
        {notes.length === 0 ? (
          <EmptyState icon={Search} title="No matching notes" description="Try different words or clear the filters." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={`/student/notes/${n.id}`} className="surface block h-full p-4 surface-interactive focus-ring">
                  <h2 className="font-medium">{n.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[n.subject, n.chapter].filter(Boolean).join(" › ") || "Unsorted"} · {formatDate(n.updated_at, profile.timezone)}
                  </p>
                  {n.excerpt ? <p className="text-subtle mt-2 line-clamp-3">{n.excerpt}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {n.tags.slice(0, 5).map((t) => (
                      <Badge key={t}>#{t}</Badge>
                    ))}
                    {n.attachments ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="size-3" aria-hidden /> {n.attachments}
                      </span>
                    ) : null}
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
        title="Notes"
        description="Private study notes, organised by subject and chapter."
        actions={
          <Button asChild>
            <Link href="/student/notes/new">
              <Plus aria-hidden /> New note
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
