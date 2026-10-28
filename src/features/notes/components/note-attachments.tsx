"use client";

import * as React from "react";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import { deleteStudyFileAction, registerStudyFileAction } from "../actions";
import type { NoteDetail } from "../queries";

export function NoteAttachments({ noteId, ownerId, files }: { noteId: string; ownerId: string; files: NoteDetail["files"] }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const remove = useServerAction(deleteStudyFileAction);

  async function upload(list: FileList) {
    setBusy(true);
    const supabase = createClient();
    for (const file of Array.from(list).slice(0, 10)) {
      const problem = validateFile(file, ACCEPTED_DOCUMENT_TYPES, LIMITS.studyFile);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const path = `${ownerId}/${noteId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const { error } = await supabase.storage.from("study-files").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error(`${file.name} couldn't be uploaded.`);
        continue;
      }
      const result = await registerStudyFileAction({ noteId, storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "We couldn't reach the server.");
        await supabase.storage.from("study-files").remove([path]);
      } else {
        toast.success(`${file.name} attached`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {files.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-md border p-2">
              {f.mimeType.startsWith("image/") && f.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                <img src={f.url} alt="" className="size-12 rounded object-cover" />
              ) : (
                <span className="grid size-12 place-items-center rounded bg-muted">
                  <FileText className="size-5 text-muted-foreground" aria-hidden />
                </span>
              )}
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium">{f.fileName}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
              </a>
              <ConfirmDialog
                title="Remove this attachment?"
                description="The file is permanently deleted."
                confirmLabel="Remove"
                destructive
                onConfirm={async () => (await remove.run(f.id))?.ok ?? false}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.fileName}`}>
                    <Trash2 />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-subtle">No attachments.</p>
      )}
      <input ref={inputRef} type="file" multiple accept={ACCEPTED_DOCUMENT_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.length && upload(e.target.files)} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />} Attach image or PDF
      </Button>
      <p className="text-xs text-muted-foreground">Up to {formatBytes(LIMITS.studyFile)} each. Only you can see your attachments.</p>
    </div>
  );
}
