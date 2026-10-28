export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const LIMITS = {
  answerSheet: 10 * 1024 * 1024,
  studyFile: 10 * 1024 * 1024,
  questionAsset: 5 * 1024 * 1024,
  questionSource: 20 * 1024 * 1024,
} as const;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side pre-check. The bucket configuration and RLS enforce the same rules server-side. */
export function validateFile(
  file: { type: string; size: number; name: string },
  accepted: readonly string[],
  maxBytes: number,
): string | null {
  if (!accepted.includes(file.type)) {
    return `${file.name}: unsupported file type. Use ${accepted.map((t) => EXTENSIONS[t]?.toUpperCase()).join(", ")}.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > maxBytes) return `${file.name} is larger than ${formatBytes(maxBytes)}.`;
  return null;
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? "bin";
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}
