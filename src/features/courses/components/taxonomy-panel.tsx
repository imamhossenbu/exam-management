"use client";

import * as React from "react";
import { Check, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerAction } from "@/components/forms/use-server-action";
import { createChapterAction, createSubjectAction, deleteTaxonomyAction, renameTaxonomyAction } from "../actions";
import type { CourseSubject } from "../queries";

function InlineAdd({ placeholder, onAdd, label }: { placeholder: string; label: string; onAdd: (name: string) => Promise<boolean> }) {
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setPending(true);
        const okay = await onAdd(value.trim());
        setPending(false);
        if (okay) setValue("");
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={150} />
      <Button type="submit" variant="outline" pending={pending} disabled={!value.trim()}>
        {!pending ? <Plus aria-hidden /> : null} Add
      </Button>
    </form>
  );
}

function EditableName({ kind, id, name }: { kind: "subjects" | "chapters"; id: string; name: string }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name);
  const rename = useServerAction(renameTaxonomyAction);
  const remove = useServerAction(deleteTaxonomyAction);
  if (editing) {
    return (
      <form
        className="flex flex-1 items-center gap-1"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await rename.run(kind, { id, name: value });
          if (r?.ok) setEditing(false);
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="New name" placeholder="New name" className="h-8" autoFocus maxLength={150} />
        <Button type="submit" size="icon-sm" variant="ghost" pending={rename.pending} aria-label="Save name">
          {!rename.pending ? <Check /> : null}
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => (setEditing(false), setValue(name))} aria-label="Cancel">
          <X />
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <span className={kind === "subjects" ? "font-medium" : "text-sm"}>{name}</span>
      <span className="flex gap-1">
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>
          <Pencil />
        </Button>
        <ConfirmDialog
          title={`Delete “${name}”?`}
          description={
            kind === "subjects"
              ? "Its chapters are deleted too. Exams tagged with this subject keep working but lose the tag."
              : "Exams tagged with this chapter keep working but lose the tag."
          }
          confirmLabel="Delete"
          destructive
          onConfirm={async () => (await remove.run(kind, id))?.ok ?? false}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${name}`}>
              <Trash2 />
            </Button>
          }
        />
      </span>
    </div>
  );
}

export function TaxonomyPanel({ courseId, subjects }: { courseId: string; subjects: CourseSubject[] }) {
  const addSubject = useServerAction(createSubjectAction);
  const addChapter = useServerAction(createChapterAction);
  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <InlineAdd label="New subject name" placeholder="New subject, e.g. Mechanics" onAdd={async (name) => (await addSubject.run({ courseId, name }))?.ok ?? false} />
      </div>
      {subjects.length === 0 ? (
        <EmptyState icon={FolderTree} title="No subjects yet" description="Subjects and chapters help organise exams, question sources and results." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.map((s) => (
            <section key={s.id} className="surface p-4" aria-label={s.name}>
              <EditableName kind="subjects" id={s.id} name={s.name} />
              <ul className="mt-3 space-y-1 border-l pl-3">
                {s.chapters.map((c) => (
                  <li key={c.id} className="flex">
                    <EditableName kind="chapters" id={c.id} name={c.name} />
                  </li>
                ))}
                {s.chapters.length === 0 ? <li className="text-xs text-muted-foreground">No chapters yet</li> : null}
              </ul>
              <div className="mt-3">
                <InlineAdd label={`New chapter in ${s.name}`} placeholder="Add chapter" onAdd={async (name) => (await addChapter.run({ subjectId: s.id, name }))?.ok ?? false} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
