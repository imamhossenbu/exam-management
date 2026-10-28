"use client";

import * as React from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toUserMessage } from "@/lib/errors";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import type { TakingFile } from "../queries";

type Props = {
  attemptId: string;
  studentId: string;
  questionId: string;
  partId: string | null;
  label: string;
  files: TakingFile[];
  disabled: boolean;
  onChange: (files: TakingFile[]) => void;
};

/** Private answer-sheet uploads for one question or sub-question. */
export function AnswerUploads({ attemptId, studentId, questionId, partId, label, files, disabled, onChange }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const inputId = `upload-${questionId}-${partId ?? "q"}`;

  async function upload(list: FileList) {
    setBusy(true);
    const supabase = createClient();
    const added: TakingFile[] = [];
    for (const file of Array.from(list).slice(0, 10)) {
      const problem = validateFile(file, ACCEPTED_DOCUMENT_TYPES, LIMITS.answerSheet);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const path = `${studentId}/${attemptId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const { error: upErr } = await supabase.storage.from("answer-sheets").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error(`${file.name} couldn't be uploaded. ${navigator.onLine ? "Uploads may be closed." : "You're offline."}`);
        continue;
      }
      const { data: id, error } = await supabase.rpc("register_answer_file", {
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_part_id: partId,
        p_storage_path: path,
        p_file_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
      });
      if (error) {
        toast.error(toUserMessage(error));
        await supabase.storage.from("answer-sheets").remove([path]);
        continue;
      }
      added.push({ id, questionId, partId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, storagePath: path, url: URL.createObjectURL(file) });
    }
    if (added.length) {
      onChange([...files, ...added]);
      toast.success(`${added.length} file(s) uploaded`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(file: TakingFile) {
    setRemoving(file.id);
    const supabase = createClient();
    const { data: path, error } = await supabase.rpc("delete_answer_file", { p_file_id: file.id });
    if (error) {
      toast.error(toUserMessage(error));
    } else {
      await supabase.storage.from("answer-sheets").remove([path]);
      onChange(files.filter((f) => f.id !== file.id));
      toast.success("File removed");
    }
    setRemoving(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {files.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((f, i) => (
            <li key={f.id} className="group relative overflow-hidden rounded-md border bg-muted">
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="block focus-ring" aria-label={`Open page ${i + 1}: ${f.fileName}`}>
                {f.mimeType.startsWith("image/") && f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private signed/blob URL
                  <img src={f.url} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <span className="flex h-28 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-6" aria-hidden /> PDF
                  </span>
                )}
                <span className="block truncate px-2 py-1 text-xs">
                  {i + 1}. {f.fileName} · {formatBytes(f.sizeBytes)}
                </span>
              </a>
              {!disabled ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-1 right-1"
                  aria-label={`Remove ${f.fileName}`}
                  pending={removing === f.id}
                  onClick={() => remove(f)}
                >
                  {removing !== f.id ? <Trash2 /> : null}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No pages uploaded yet.</p>
      )}
      {!disabled ? (
        <>
          <input ref={inputRef} id={inputId} type="file" multiple accept={ACCEPTED_DOCUMENT_TYPES.join(",")} className="sr-only" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {busy ? "Uploading…" : "Upload answer pages"}
          </Button>
          <p className="text-xs text-muted-foreground">Photos (JPG, PNG, WebP) or PDF, up to {formatBytes(LIMITS.answerSheet)} each. Upload pages in order.</p>
        </>
      ) : null}
    </div>
  );
}
