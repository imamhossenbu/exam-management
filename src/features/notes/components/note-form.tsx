"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  MoveDown,
  MoveUp,
  Paperclip,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { applyFieldErrors } from "@/components/forms/use-server-action";
import { noteSchema, type NoteInput, type NoteOutput } from "@/lib/validations/notes";
import { createNoteAction, deleteNoteAction, registerStudyFileAction, updateNoteAction } from "../actions";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import { cn } from "@/lib/utils/cn";

type SelectedFileItem = {
  id: string;
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

type Props = {
  noteId?: string;
  ownerId?: string;
  defaultValues: NoteInput;
  suggestions: { subjects: string[]; chapters: string[] };
};

export function NoteForm({ noteId, ownerId, defaultValues, suggestions }: Props) {
  const form = useForm<NoteInput, unknown, NoteOutput>({ resolver: zodResolver(noteSchema), defaultValues });
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = React.useState<SelectedFileItem[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [progressMsg, setProgressMsg] = React.useState("");

  const { errors, isDirty } = form.formState;

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty || selectedFiles.length > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [form.formState, selectedFiles.length]);

  function handleFilesAdded(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const validItems: SelectedFileItem[] = [];

    for (const f of incoming) {
      const problem = validateFile(f, ACCEPTED_DOCUMENT_TYPES, LIMITS.studyFile);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const isImg = f.type.startsWith("image/");
      const previewUrl = isImg ? URL.createObjectURL(f) : null;
      validItems.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl,
        isImage: isImg,
      });
    }

    if (validItems.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validItems]);
      toast.info(`Added ${validItems.length} file(s) to attach.`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeSelectedFile(id: string) {
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function moveSelectedFile(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= selectedFiles.length) return;
    setSelectedFiles((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
  }

  async function onSubmit(values: NoteOutput) {
    setIsSubmitting(true);
    setProgressMsg(noteId ? "Saving note changes…" : "Creating resource…");

    try {
      let targetNoteId = noteId;

      if (!targetNoteId) {
        // Create new note
        const createResult = await createNoteAction({ ...values, tags: values.tags.join(", ") });
        if (!createResult.ok) {
          applyFieldErrors(form.setError, createResult);
          toast.error(createResult.error || "Could not create note.");
          setIsSubmitting(false);
          setProgressMsg("");
          return;
        }
        targetNoteId = createResult.data.id;
      } else {
        // Update existing note
        const updateResult = await updateNoteAction(targetNoteId, { ...values, tags: values.tags.join(", ") });
        if (!updateResult.ok) {
          applyFieldErrors(form.setError, updateResult);
          toast.error(updateResult.error || "Could not update note.");
          setIsSubmitting(false);
          setProgressMsg("");
          return;
        }
      }

      // If user attached files, upload them now
      if (selectedFiles.length > 0) {
        const supabase = createClient();
        let currentOwnerId = ownerId;

        if (!currentOwnerId) {
          const { data: userRes } = await supabase.auth.getUser();
          currentOwnerId = userRes?.user?.id;
        }

        if (!currentOwnerId) {
          toast.error("Session expired. Please sign in again.");
          setIsSubmitting(false);
          setProgressMsg("");
          return;
        }

        let uploadCount = 0;
        for (let i = 0; i < selectedFiles.length; i++) {
          const item = selectedFiles[i];
          setProgressMsg(`Uploading ${i + 1} of ${selectedFiles.length}: ${item.file.name}…`);

          const ext = extensionFor(item.file.type);
          const path = `${currentOwnerId}/${targetNoteId}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("study-files")
            .upload(path, item.file, { contentType: item.file.type, upsert: false });

          if (uploadError) {
            console.error(uploadError);
            toast.error(`Failed to upload ${item.file.name}`);
            continue;
          }

          const reg = await registerStudyFileAction({
            noteId: targetNoteId,
            storagePath: path,
            fileName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
          }).catch(() => null);

          if (reg?.ok) uploadCount++;
        }

        if (uploadCount > 0) {
          toast.success(`Attached ${uploadCount} file(s) to this resource.`);
        }
      }

      form.reset({ ...values, tags: values.tags.join(", ") });
      setSelectedFiles([]);
      toast.success(noteId ? "Resource updated successfully" : "Resource created successfully");

      router.push(`/student/notes/${targetNoteId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong while saving.");
    } finally {
      setIsSubmitting(false);
      setProgressMsg("");
    }
  }

  async function handleDelete() {
    if (!noteId) return false;
    const res = await deleteNoteAction(noteId);
    if (res?.ok) {
      toast.success("Resource deleted");
      router.push("/student/notes");
      return true;
    }
    toast.error(res?.error || "Could not delete note");
    return false;
  }

  return (
    <form noValidate className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
      <Field id="note-title" label="Title" required error={errors.title?.message}>
        {(a) => <Input placeholder="e.g. Physics Chapter 4 — Thermodynamics Notes" {...a} {...form.register("title")} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="note-subject" label="Subject" error={errors.subject?.message}>
          {(a) => <Input list="note-subjects" placeholder="e.g. Physics" {...a} {...form.register("subject")} />}
        </Field>
        <Field id="note-chapter" label="Chapter" error={errors.chapter?.message}>
          {(a) => <Input list="note-chapters" placeholder="e.g. Heat & Laws" {...a} {...form.register("chapter")} />}
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
        {(a) => <Input placeholder="formula, revision, exam-prep" {...a} {...form.register("tags")} />}
      </Field>

      {/* ATTACH FILES RIGHT AT CREATION TIME */}
      <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">
              Attach PDFs or Note Images
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "Upload immediately"}
          </span>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.length) handleFilesAdded(e.dataTransfer.files);
          }}
          onClick={() => !isSubmitting && fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center",
            isDragOver
              ? "border-primary bg-primary/10 scale-[1.01]"
              : "border-border/80 hover:border-primary/50 hover:bg-card/70 bg-card/40",
            isSubmitting && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_DOCUMENT_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => e.target.files?.length && handleFilesAdded(e.target.files)}
          />
          <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center mb-1.5">
            <UploadCloud className="size-5" />
          </div>
          <p className="text-xs font-semibold text-foreground">
            Click or drag & drop PDFs or Multi-page Images here
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Photos of handwritten notes will be arranged sequentially into a readable notebook.
          </p>
        </div>

        {/* Selected files preview list */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Selected Files ({selectedFiles.length})
              </span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedFiles.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 p-2 rounded-xl border border-border/80 bg-surface shadow-xs"
                >
                  <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white shrink-0">
                    #{idx + 1}
                  </span>
                  {item.isImage && item.previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.previewUrl} alt="" className="size-10 rounded object-cover ring-1 ring-border shrink-0" />
                  ) : (
                    <div className="grid size-10 place-items-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 font-bold text-[10px]">
                      PDF
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{item.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(item.file.size)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSelectedFile(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-20"
                      title="Move earlier"
                    >
                      <MoveUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelectedFile(idx, idx + 1)}
                      disabled={idx === selectedFiles.length - 1}
                      className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-20"
                      title="Move later"
                    >
                      <MoveDown className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile(item.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted"
                      title="Remove"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Field id="note-body" label="Summary & Written Notes" error={errors.body?.message}>
        {(a) => (
          <Textarea
            rows={10}
            className="font-mono text-sm leading-relaxed"
            placeholder="Write key takeaways, summary points, formulas, or lecture explanations…"
            {...a}
            {...form.register("body")}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {noteId ? (
          <ConfirmDialog
            title="Delete this resource?"
            description="The resource and all its attached files will be permanently deleted."
            confirmLabel="Delete resource"
            destructive
            onConfirm={handleDelete}
            trigger={
              <Button type="button" variant="ghost" className="text-danger hover:bg-destructive/10">
                <Trash2 aria-hidden className="size-4" /> Delete resource
              </Button>
            }
          />
        ) : (
          <span />
        )}

        <Button
          type="submit"
          disabled={isSubmitting || (Boolean(noteId) && !isDirty && selectedFiles.length === 0)}
          className="gap-2 min-w-[140px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>{progressMsg || "Processing…"}</span>
            </>
          ) : noteId ? (
            "Save resource"
          ) : (
            `Create Resource${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ""}`
          )}
        </Button>
      </div>
    </form>
  );
}
