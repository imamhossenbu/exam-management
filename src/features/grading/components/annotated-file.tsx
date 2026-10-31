"use client";

import * as React from "react";
import { ArrowUpRight, Check, ExternalLink, FileText, Highlighter, MessageSquare, MousePointer2, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { addAnnotationAction, deleteAnnotationAction } from "../actions";
import { T, tNow } from "@/lib/i18n/client";

export type AnnotationShape = {
  id: string;
  answer_file_id: string;
  page: number;
  kind: string;
  x: number;
  y: number;
  x2: number | null;
  y2: number | null;
  body: string | null;
};

type Tool = "select" | "tick" | "cross" | "comment" | "highlight" | "arrow";

const TOOLS: { id: Tool; label: string; icon: typeof Check }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "tick", label: "Tick", icon: Check },
  { id: "cross", label: "Cross", icon: X },
  { id: "comment", label: "Comment", icon: MessageSquare },
  { id: "highlight", label: "Highlight (drag)", icon: Highlighter },
  { id: "arrow", label: "Arrow (drag)", icon: ArrowUpRight },
];

// SVG coordinates use a 0–1000 viewBox; stored values are normalized 0–1.
const S = 1000;

function Shape({ a, selected, onSelect, index }: { a: AnnotationShape; selected: boolean; onSelect?: () => void; index: number }) {
  const x = a.x * S;
  const y = a.y * S;
  const common = { onClick: onSelect, className: cn(onSelect && "cursor-pointer"), "aria-label": `${a.kind}${a.body ? `: ${a.body}` : ""}` };
  const stroke = selected ? 6 : 4;
  switch (a.kind) {
    case "tick":
      return <path {...common} d={`M${x - 18} ${y} L${x - 4} ${y + 16} L${x + 22} ${y - 18}`} fill="none" stroke="var(--annotation-tick)" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    case "cross":
      return (
        <g {...common} stroke="var(--annotation-cross)" strokeWidth={stroke} strokeLinecap="round">
          <line x1={x - 16} y1={y - 16} x2={x + 16} y2={y + 16} vectorEffect="non-scaling-stroke" />
          <line x1={x + 16} y1={y - 16} x2={x - 16} y2={y + 16} vectorEffect="non-scaling-stroke" />
        </g>
      );
    case "highlight": {
      const x2 = (a.x2 ?? a.x) * S;
      const y2 = (a.y2 ?? a.y) * S;
      return (
        <rect
          {...common}
          x={Math.min(x, x2)}
          y={Math.min(y, y2)}
          width={Math.abs(x2 - x)}
          height={Math.abs(y2 - y)}
          fill="var(--annotation-highlight)"
          stroke={selected ? "var(--annotation-arrow)" : "none"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    case "arrow": {
      const x2 = (a.x2 ?? a.x) * S;
      const y2 = (a.y2 ?? a.y) * S;
      return <line {...common} x1={x} y1={y} x2={x2} y2={y2} stroke="var(--annotation-arrow)" strokeWidth={stroke} strokeLinecap="round" markerEnd="url(#arrowhead)" vectorEffect="non-scaling-stroke" />;
    }
    default:
      return (
        <g {...common}>
          <circle cx={x} cy={y} r={selected ? 20 : 16} fill="var(--annotation-comment)" />
          <text x={x} y={y + 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="white">
            {index + 1}
          </text>
        </g>
      );
  }
}

type Props = {
  attemptId: string;
  file: { id: string; fileName: string; mimeType: string; url: string | null };
  annotations: AnnotationShape[];
  editable: boolean;
};

/** Shows one answer file with an annotation overlay. PDFs get page-referenced comments instead of drawings. */
export function AnnotatedFile({ attemptId, file, annotations: initial, editable }: Props) {
  const [items, setItems] = React.useState(initial);
  const [tool, setTool] = React.useState<Tool>("select");
  const [zoom, setZoom] = React.useState(1);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [comment, setComment] = React.useState("");
  const [pdfPage, setPdfPage] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const isPdf = file.mimeType === "application/pdf";
  const comments = items.filter((a) => a.kind === "comment");

  function point(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
  }

  async function add(shape: Omit<AnnotationShape, "id" | "answer_file_id">) {
    setBusy(true);
    try {
      const result = await addAnnotationAction({ attemptId, answerFileId: file.id, ...shape });
      if (result.ok) {
        setItems((all) => [...all, { ...shape, id: result.data.id, answer_file_id: file.id }]);
        if (shape.kind === "comment") setComment("");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(tNow("We couldn't reach the server. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const result = await deleteAnnotationAction(id).catch(() => null);
    if (result?.ok) {
      setItems((all) => all.filter((a) => a.id !== id));
      setSelected(null);
    } else {
      toast.error(result && !result.ok ? result.error : "Couldn't delete the annotation.");
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!editable || busy || tool === "select") return;
    const p = point(e);
    if (tool === "highlight" || tool === "arrow") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraft({ x: p.x, y: p.y, x2: p.x, y2: p.y });
    } else if (tool === "comment") {
      if (!comment.trim()) return toast.error(tNow("Type the comment in the box first, then click where it belongs."));
      void add({ kind: "comment", page: 1, x: p.x, y: p.y, x2: null, y2: null, body: comment.trim() });
    } else {
      void add({ kind: tool, page: 1, x: p.x, y: p.y, x2: null, y2: null, body: null });
    }
  }

  function onPointerUp() {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (Math.abs(d.x2 - d.x) < 0.01 && Math.abs(d.y2 - d.y) < 0.01) return;
    void add({ kind: tool, page: 1, x: d.x, y: d.y, x2: d.x2, y2: d.y2, body: null });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{file.fileName}</p>
        <div className="flex items-center gap-1">
          {!isPdf ? (
            <>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                <ZoomIn />
              </Button>
            </>
          ) : null}
          {file.url ? (
            <Button asChild size="icon-sm" variant="ghost">
              <a href={file.url} target="_blank" rel="noreferrer" aria-label={`Open ${file.fileName} in a new tab`}>
                <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/50 p-1" role="toolbar" aria-label="Annotation tools">
          {(isPdf ? TOOLS.filter((t) => t.id === "comment") : TOOLS).map((t) => (
            <Button key={t.id} type="button" size="sm" variant={tool === t.id ? "secondary" : "ghost"} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
              <t.icon aria-hidden /> <span className="hidden sm:inline">{t.label}</span>
            </Button>
          ))}
          {(tool === "comment" || isPdf) && (
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment text…" aria-label="Comment text" className="h-8 min-w-48 flex-1" maxLength={1000} />
          )}
          {isPdf ? (
            <>
              <Input type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(Math.max(1, Number(e.target.value) || 1))} aria-label="Page number" className="h-8 w-20" />
              <Button type="button" size="sm" pending={busy} disabled={!comment.trim()} onClick={() => add({ kind: "comment", page: pdfPage, x: 0, y: 0, x2: null, y2: null, body: comment.trim() })}>
                <T>Add page comment</T>
              </Button>
            </>
          ) : null}
          {selected && !isPdf ? (
            <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => remove(selected)}>
              <Trash2 aria-hidden /> <T>Delete selected</T>
            </Button>
          ) : null}
        </div>
      ) : null}

      {!file.url ? (
        <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground"><T>This file couldn&apos;t be loaded.</T></p>
      ) : isPdf ? (
        <iframe src={file.url} title={file.fileName} className="h-[36rem] w-full rounded-md border bg-muted" />
      ) : (
        <div className="max-h-[40rem] overflow-auto rounded-md border bg-muted">
          <div className="relative" style={{ width: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
            <img src={file.url} alt={`Answer sheet ${file.fileName}`} className="block w-full select-none" draggable={false} />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${S} ${S}`}
              preserveAspectRatio="none"
              className={cn("absolute inset-0 size-full touch-none", editable && tool !== "select" && "cursor-crosshair")}
              onPointerDown={onPointerDown}
              onPointerMove={(e) => draft && setDraft({ ...draft, ...(({ x, y }) => ({ x2: x, y2: y }))(point(e)) })}
              onPointerUp={onPointerUp}
              role="img"
              aria-label={`${items.length} annotation(s)`}
            >
              <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--annotation-arrow)" />
                </marker>
              </defs>
              {items.map((a) => (
                <Shape key={a.id} a={a} index={comments.indexOf(a)} selected={selected === a.id} onSelect={editable && tool === "select" ? () => setSelected(a.id) : undefined} />
              ))}
              {draft ? <Shape a={{ id: "draft", answer_file_id: file.id, page: 1, kind: tool, x: draft.x, y: draft.y, x2: draft.x2, y2: draft.y2, body: null }} index={-1} selected={false} /> : null}
            </svg>
          </div>
        </div>
      )}

      {comments.length ? (
        <ol className="space-y-1 text-sm">
          {comments.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-annotation-comment text-xs font-bold text-white" aria-hidden>
                {isPdf ? <FileText className="size-3" /> : i + 1}
              </span>
              <span className="flex-1">
                {isPdf ? <span className="text-muted-foreground">Page {c.page}: </span> : null}
                {c.body}
              </span>
              {editable ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete comment" onClick={() => remove(c.id)}>
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
