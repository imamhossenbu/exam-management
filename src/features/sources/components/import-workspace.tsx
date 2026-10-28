"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSearch, FileText, ImageIcon, ScanText, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useServerAction } from "@/components/forms/use-server-action";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/files";
import type { Enums } from "@/types/database";
import { extractSourceTextAction, saveSourceTextAction } from "../actions";
import { parseQuestions } from "../parse-questions";
import type { SourceRow } from "../queries";
import { DraftReviewList, toEditable, type EditableDraft } from "./draft-review-list";
import { SourceUploader } from "./source-uploader";
import { blankQuestion } from "@/features/exams/components/question-editor-dialog";

const STATUS_META: Record<Enums<"extraction_status">, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  pending: { label: "Not extracted", tone: "neutral" },
  extracted: { label: "Text ready", tone: "success" },
  failed: { label: "Needs manual text", tone: "warning" },
  manual: { label: "Manual / OCR", tone: "info" },
};

function SourcePreview({ source }: { source: SourceRow }) {
  if (!source.url) return <p className="text-subtle">Preview unavailable.</p>;
  if (source.mimeType === "application/pdf") {
    return <iframe src={source.url} title={`Preview of ${source.fileName}`} className="h-[28rem] w-full rounded-md border bg-muted" />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return <img src={source.url} alt={`Preview of ${source.fileName}`} className="max-h-[28rem] w-full rounded-md border object-contain" />;
}

export function ImportWorkspace({
  examId,
  examType,
  teacherId,
  sources,
}: {
  examId: string;
  examType: Enums<"exam_type">;
  teacherId: string;
  sources: SourceRow[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(sources[0]?.id ?? null);
  const selected = sources.find((s) => s.id === selectedId) ?? null;
  const [text, setText] = React.useState(selected?.text ?? "");
  const [drafts, setDrafts] = React.useState<EditableDraft[]>([]);
  const [ocrProgress, setOcrProgress] = React.useState<number | null>(null);
  const extract = useServerAction(extractSourceTextAction, { onSuccess: (d) => setText(d.text) });
  const saveText = useServerAction(saveSourceTextAction);

  function selectSource(id: string) {
    setSelectedId(id);
    setText(sources.find((s) => s.id === id)?.text ?? "");
    setDrafts([]);
  }

  async function runOcr() {
    if (!selected?.url) return;
    setOcrProgress(0);
    try {
      // Loaded on demand; OCR runs in the browser so no image leaves the teacher's device except to private storage.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && setOcrProgress(Math.round(m.progress * 100)),
      });
      const result = await worker.recognize(selected.url);
      await worker.terminate();
      const recognized = result.data.text.trim();
      if (!recognized) {
        toast.error("No text was recognised. Type the questions manually.");
      } else {
        setText(recognized);
        await saveText.run(selected.id, recognized, "ocr");
        toast.info(`OCR confidence ${Math.round(result.data.confidence)}%. Check the text carefully.`);
      }
    } catch (error) {
      console.error(error);
      toast.error("OCR isn't available right now (it needs to download a language model). Type the text manually instead.");
    } finally {
      setOcrProgress(null);
    }
  }

  function parse() {
    const found = parseQuestions(text);
    if (found.length === 0) {
      toast.error("No numbered questions found. Make sure each question starts with “1.”, “2.”, … or add drafts manually.");
      return;
    }
    setDrafts(toEditable(found, examType));
    toast.success(`Found ${found.length} draft question(s). Review each one.`);
  }

  function addBlankDraft() {
    const blank = blankQuestion(examType);
    setDrafts((d) => [...d, ...toEditable([{ type: blank.type, body: "", options: blank.type === "mcq" ? ["", "", "", ""] : [], suggestedCorrectIndex: -1, marks: 1 }], examType)]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-3">
        <SourceUploader teacherId={teacherId} examId={examId} onUploaded={(id) => (selectSource(id), router.refresh())} />
        {sources.length ? (
          <ul className="surface divide-y" aria-label="Uploaded files">
            {sources.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectSource(s.id)}
                  aria-current={s.id === selectedId ? "true" : undefined}
                  className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted focus-ring", s.id === selectedId && "bg-primary-soft/60")}
                >
                  {s.mimeType === "application/pdf" ? <FileText className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ImageIcon className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.fileName}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(s.sizeBytes)}</span>
                  </span>
                  <Badge tone={STATUS_META[s.status].tone}>{STATUS_META[s.status].label}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button variant="outline" className="w-full" onClick={addBlankDraft}>
          <Sparkles aria-hidden /> Add a blank draft
        </Button>
      </aside>

      <section className="min-w-0 space-y-6">
        {selected ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <h2 className="section-title">Original</h2>
              <SourcePreview source={selected} />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">Text</h2>
                <div className="flex flex-wrap gap-2">
                  {selected.mimeType === "application/pdf" ? (
                    <Button size="sm" variant="outline" pending={extract.pending} onClick={() => extract.run(selected.id)}>
                      {!extract.pending ? <FileSearch aria-hidden /> : null} Extract text
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={ocrProgress !== null} onClick={runOcr}>
                      <ScanText aria-hidden /> {ocrProgress !== null ? `OCR ${ocrProgress}%` : "Run OCR"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" pending={saveText.pending} disabled={text === selected.text} onClick={() => saveText.run(selected.id, text, "manual")}>
                    Save text
                  </Button>
                </div>
              </div>
              {selected.error ? <p className="text-xs text-warning-soft-foreground">{selected.error}</p> : null}
              <Textarea
                aria-label="Extracted or transcribed text"
                rows={16}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Extracted text appears here. You can also type or paste the questions — number each one (1., 2., …) and letter options (a), (b), …"
                className="font-mono text-xs"
              />
              <Button onClick={parse} disabled={!text.trim()}>
                <Wand2 aria-hidden /> Create drafts from text
              </Button>
            </div>
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState icon={FileSearch} title="Upload a question paper" description="Upload a PDF or photo, extract or type its text, then review the detected questions before adding them." />
        ) : null}

        {drafts.length ? (
          <DraftReviewList examId={examId} sourceId={selected?.id ?? null} examType={examType} drafts={drafts} onChange={setDrafts} onImported={() => router.refresh()} />
        ) : null}
      </section>
    </div>
  );
}
