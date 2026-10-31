"use client";

import * as React from "react";
import { Download, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useServerAction } from "@/components/forms/use-server-action";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import { deleteStudyFileAction, registerStudyFileAction } from "../actions";
import type { NoteDetail } from "../queries";
import { cn } from "@/lib/utils/cn";
import { T, tNow } from "@/lib/i18n/client";

export function NoteAttachments({
  noteId,
  ownerId,
  files,
}: {
  noteId: string;
  ownerId: string;
  files: NoteDetail["files"];
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [progressMsg, setProgressMsg] = React.useState("");
  const [isDragOver, setIsDragOver] = React.useState(false);
  const remove = useServerAction(deleteStudyFileAction);

  async function upload(list: FileList | File[]) {
    const fileArray = Array.from(list).slice(0, 50);
    if (!fileArray.length) return;

    setBusy(true);
    const supabase = createClient();
    let successCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setProgressMsg(`Uploading ${i + 1} of ${fileArray.length}: ${file.name}...`);

      const problem = validateFile(file, ACCEPTED_DOCUMENT_TYPES, LIMITS.studyFile);
      if (problem) {
        toast.error(problem);
        continue;
      }

      const path = `${ownerId}/${noteId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const { error } = await supabase.storage
        .from("study-files")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error(tNow("{v0} couldn't be uploaded.", { v0: file.name }));
        continue;
      }

      const result = await registerStudyFileAction({
        noteId,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }).catch(() => null);

      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "We couldn't reach the server.");
        await supabase.storage.from("study-files").remove([path]);
      } else {
        successCount++;
      }
    }

    setBusy(false);
    setProgressMsg("");
    if (successCount > 0) {
      toast.success(tNow("Successfully uploaded {v0} file(s)", { v0: successCount }));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      upload(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-4">
      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center",
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_DOCUMENT_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
        {busy ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-6 text-primary animate-spin" />
            <p className="text-xs font-semibold text-primary">{progressMsg}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center">
              <UploadCloud className="size-5" />
            </div>
            <p className="text-xs font-semibold text-foreground">
              <T>Click or drag & drop PDFs or Images</T>
            </p>
            <p className="text-[11px] text-muted-foreground">
              <T>Upload multi-page note images or PDF study guides (up to 10MB each)</T>
            </p>
          </div>
        )}
      </div>

      {/* Files List */}
      {files.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Uploaded Files ({files.length})
          </p>
          <ul className="divide-y divide-border/60 rounded-xl border bg-surface/50 overflow-hidden">
            {files.map((f, idx) => {
              const isPdf = f.mimeType === "application/pdf";
              const isImage = f.mimeType.startsWith("image/");
              return (
                <li key={f.id} className="flex items-center gap-3 p-2.5 transition-colors hover:bg-muted/30">
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">
                    {idx + 1}
                  </span>
                  {isImage && f.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={f.url} alt="" className="size-10 rounded-md object-cover ring-1 ring-border shrink-0" />
                  ) : (
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-md shrink-0 font-bold text-[10px]",
                        isPdf ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isPdf ? "PDF" : <FileText className="size-5" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{f.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">{formatBytes(f.sizeBytes)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.url && (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        download={f.fileName}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Download file"
                      >
                        <Download className="size-3.5" />
                      </a>
                    )}
                    <ConfirmDialog
                      title="Remove this attachment?"
                      description="The file is permanently deleted."
                      confirmLabel="Remove"
                      destructive
                      onConfirm={async () => (await remove.run(f.id))?.ok ?? false}
                      trigger={
                        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${f.fileName}`}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2"><T>No attachments yet.</T></p>
      )}
    </div>
  );
}
