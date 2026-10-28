"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { noteSchema, type NoteInput, type NoteOutput } from "@/lib/validations/notes";
import { createNoteAction, deleteNoteAction, updateNoteAction } from "../actions";

type Props = {
  noteId?: string;
  defaultValues: NoteInput;
  suggestions: { subjects: string[]; chapters: string[] };
};

export function NoteForm({ noteId, defaultValues, suggestions }: Props) {
  const form = useForm<NoteInput, unknown, NoteOutput>({ resolver: zodResolver(noteSchema), defaultValues });
  const save = React.useCallback((v: NoteOutput) => (noteId ? updateNoteAction(noteId, { ...v, tags: v.tags.join(", ") }) : createNoteAction({ ...v, tags: v.tags.join(", ") })), [noteId]);
  const { run, pending } = useServerAction(save);
  const remove = useServerAction(deleteNoteAction, { successMessage: "Note deleted" });
  const { errors, isDirty } = form.formState;

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [form.formState]);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await run(values);
        applyFieldErrors(form.setError, result);
        if (result?.ok) form.reset(form.getValues());
      })}
    >
      <Field id="note-title" label="Title" required error={errors.title?.message}>
        {(a) => <Input placeholder="e.g. Newton's laws — summary" {...a} {...form.register("title")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="note-subject" label="Subject" error={errors.subject?.message}>
          {(a) => <Input list="note-subjects" placeholder="e.g. Physics" {...a} {...form.register("subject")} />}
        </Field>
        <Field id="note-chapter" label="Chapter" error={errors.chapter?.message}>
          {(a) => <Input list="note-chapters" placeholder="e.g. Motion" {...a} {...form.register("chapter")} />}
        </Field>
      </div>
      <datalist id="note-subjects">
        {suggestions.subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="note-chapters">
        {suggestions.chapters.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field id="note-tags" label="Tags" description="Separate tags with commas." error={errors.tags?.message}>
        {(a) => <Input placeholder="formula, revision" {...a} {...form.register("tags")} />}
      </Field>
      <Field id="note-body" label="Note" error={errors.body?.message}>
        {(a) => <Textarea rows={16} className="font-mono text-sm" placeholder="Write your notes here — key points, formulas, examples…" {...a} {...form.register("body")} />}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {noteId ? (
          <ConfirmDialog
            title="Delete this note?"
            description="The note and its attachments are permanently deleted."
            confirmLabel="Delete note"
            destructive
            onConfirm={async () => (await remove.run(noteId))?.ok ?? false}
            trigger={
              <Button type="button" variant="ghost" className="text-danger">
                <Trash2 aria-hidden /> Delete
              </Button>
            }
          />
        ) : (
          <span />
        )}
        <Button type="submit" pending={pending} disabled={Boolean(noteId) && !isDirty}>
          {noteId ? "Save note" : "Create note"}
        </Button>
      </div>
    </form>
  );
}
