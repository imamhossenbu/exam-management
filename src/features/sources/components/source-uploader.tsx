"use client";

import * as React from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import { cn } from "@/lib/utils/cn";
import { registerSourceAction } from "../actions";
import { tNow } from "@/lib/i18n/client";

/** Uploads PDFs/images to the private question-sources bucket under {teacherId}/. */
export function SourceUploader({ teacherId, examId, onUploaded }: { teacherId: string; examId?: string; onUploaded?: (id: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 10);
    setBusy(true);
    const supabase = createClient();
    for (const file of list) {
      const problem = validateFile(file, ACCEPTED_DOCUMENT_TYPES, LIMITS.questionSource);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const path = `${teacherId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const { error } = await supabase.storage.from("question-sources").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        console.error(error);
        toast.error(`${file.name} couldn't be uploaded.`);
        continue;
      }
      try {
        const result = await registerSourceAction({ storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size, examId: examId ?? null });
        if (result.ok) {
          toast.success(`${file.name} uploaded`);
          onUploaded?.(result.data.id);
        } else {
          toast.error(result.error);
          await supabase.storage.from("question-sources").remove([path]);
        }
      } catch {
        toast.error(tNow("We couldn't reach the server. Check your connection and try again."));
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy && e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
      className={cn("rounded-lg border-2 border-dashed p-6 text-center transition-colors", dragging && "border-primary bg-primary-soft/40")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENT_TYPES.join(",")}
        className="sr-only"
        id="source-upload"
        onChange={(e) => e.target.files?.length && upload(e.target.files)}
      />
      <label htmlFor="source-upload" className={cn("flex cursor-pointer flex-col items-center gap-2", busy && "pointer-events-none opacity-60")}>
        {busy ? <Loader2 className="size-6 animate-spin text-primary" aria-hidden /> : <UploadCloud className="size-6 text-primary" aria-hidden />}
        <span className="text-sm font-medium">{busy ? "Uploading…" : "Drop PDFs or images here, or click to choose"}</span>
        <span className="text-xs text-muted-foreground">PDF, PNG, JPG or WebP · up to {formatBytes(LIMITS.questionSource)} each · stored privately</span>
      </label>
    </div>
  );
}
