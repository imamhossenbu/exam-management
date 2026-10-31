"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_IMAGE_TYPES, LIMITS, extensionFor, validateFile } from "@/lib/utils/files";
import { T, tNow } from "@/lib/i18n/client";

/** Uploads a question image to the private question-assets bucket under {examId}/. */
export function QuestionImageUpload({
  examId,
  value,
  previewUrl,
  onChange,
}: {
  examId: string;
  value: string | null;
  previewUrl: string | null;
  onChange: (path: string | null, previewUrl: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File) {
    const problem = validateFile(file, ACCEPTED_IMAGE_TYPES, LIMITS.questionAsset);
    if (problem) return toast.error(problem);
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${examId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const { error } = await supabase.storage.from("question-assets").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(path, URL.createObjectURL(file));
    } catch (error) {
      console.error(error);
      toast.error(tNow("The image couldn't be uploaded. Try again."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value && previewUrl ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed/blob URL */}
          <img src={previewUrl} alt="Question attachment preview" className="max-h-48 rounded-md border" />
          <Button type="button" size="icon-sm" variant="secondary" className="absolute top-1 right-1" aria-label="Remove image" onClick={() => onChange(null, null)}>
            <X />
          </Button>
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
        {value ? "Replace image" : "Attach image or diagram"}
      </Button>
      <p className="text-xs text-muted-foreground"><T>PNG, JPG or WebP, up to 5 MB. Stored privately.</T></p>
    </div>
  );
}
