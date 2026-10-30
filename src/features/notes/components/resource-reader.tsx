"use client";

import * as React from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Grid,
  List,
  Maximize2,
  Minimize2,
  MoveDown,
  MoveUp,
  Paperclip,
  RotateCcw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils/files";
import { cn } from "@/lib/utils/cn";
import { NoteForm } from "./note-form";
import { NoteAttachments } from "./note-attachments";
import type { NoteDetail } from "../queries";

type Props = {
  note: NoteDetail;
  ownerId: string;
  taxonomy: {
    subjects: { name: string; chapters: { name: string }[] }[];
  };
};

export function ResourceReader({ note, ownerId, taxonomy }: Props) {
  const [activeTab, setActiveTab] = React.useState<"read" | "edit">("read");

  // Filter study files
  const initialImages = React.useMemo(
    () => note.files.filter((f) => f.mimeType.startsWith("image/")),
    [note.files],
  );
  const pdfs = React.useMemo(
    () => note.files.filter((f) => f.mimeType === "application/pdf"),
    [note.files],
  );
  const hasText = Boolean(note.body?.trim());

  // Image re-ordering state for sequential notebook view
  const [orderMap, setOrderMap] = React.useState<string[]>([]);
  const images = React.useMemo(() => {
    if (!orderMap.length) return initialImages;
    const map = new Map(initialImages.map((img) => [img.id, img]));
    const ordered: typeof initialImages = [];
    for (const id of orderMap) {
      const found = map.get(id);
      if (found) {
        ordered.push(found);
        map.delete(id);
      }
    }
    for (const img of map.values()) {
      ordered.push(img);
    }
    return ordered;
  }, [initialImages, orderMap]);

  // Reader state
  const [viewMode, setViewMode] = React.useState<"continuous" | "slide">("continuous");
  const [currentPage, setCurrentPage] = React.useState(0);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const [selectedPdfId, setSelectedPdfId] = React.useState(pdfs[0]?.id || "");
  const [contentFilter, setContentFilter] = React.useState<"all" | "images" | "pdfs" | "text">("all");
  const [isArrangeOpen, setIsArrangeOpen] = React.useState(false);
  const [fullscreenImage, setFullscreenImage] = React.useState<string | null>(null);

  const activePdf = pdfs.find((p) => p.id === selectedPdfId) || pdfs[0];

  // Keyboard navigation in slide mode
  React.useEffect(() => {
    if (activeTab !== "read" || viewMode !== "slide" || images.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setCurrentPage((p) => Math.min(images.length - 1, p + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentPage((p) => Math.max(0, p - 1));
      } else if (e.key === "Escape") {
        setFullscreenImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, viewMode, images.length]);

  // Page reordering (move page up/down in sequence)
  function moveImage(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= images.length) return;
    const currentIds = images.map((img) => img.id);
    const [moved] = currentIds.splice(fromIdx, 1);
    currentIds.splice(toIdx, 0, moved);
    setOrderMap(currentIds);
  }

  function handleZoomIn() {
    setZoomLevel((z) => Math.min(2.5, +(z + 0.25).toFixed(2)));
  }

  function handleZoomOut() {
    setZoomLevel((z) => Math.max(0.75, +(z - 0.25).toFixed(2)));
  }

  function handleResetZoom() {
    setZoomLevel(1);
  }

  return (
    <div className="space-y-6">
      {/* Top action switcher bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/70 border border-border/80">
          <button
            type="button"
            onClick={() => setActiveTab("read")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "read"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="size-4 text-primary" />
            Study & Read
            {images.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {images.length}p
              </span>
            )}
            {pdfs.length > 0 && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                {pdfs.length} PDF
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "edit"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Edit3 className="size-4 text-muted-foreground" />
            Edit & Files ({note.files.length})
          </button>
        </div>

        {activeTab === "read" && (images.length > 0 || pdfs.length > 0 || hasText) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills if multiple content types exist */}
            {(images.length > 0 ? 1 : 0) + (pdfs.length > 0 ? 1 : 0) + (hasText ? 1 : 0) > 1 && (
              <div className="flex items-center gap-1 rounded-lg border bg-surface p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setContentFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-colors",
                    contentFilter === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All
                </button>
                {images.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setContentFilter("images")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      contentFilter === "images" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Images ({images.length})
                  </button>
                )}
                {pdfs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setContentFilter("pdfs")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      contentFilter === "pdfs" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    PDF ({pdfs.length})
                  </button>
                )}
                {hasText && (
                  <button
                    type="button"
                    onClick={() => setContentFilter("text")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      contentFilter === "text" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Text
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* READ & STUDY MODE */}
      {activeTab === "read" ? (
        <div className="space-y-8">
          {/* EMPTY STATE */}
          {images.length === 0 && pdfs.length === 0 && !hasText && (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-border bg-card/40">
              <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary mb-4">
                <Paperclip className="size-7" />
              </div>
              <h3 className="text-base font-semibold">No materials attached yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Upload your PDF documents, slide images, or handwritten notebook photos to read and study them right here.
              </p>
              <Button onClick={() => setActiveTab("edit")} className="mt-4 gap-2">
                <Paperclip className="size-4" /> Upload PDFs or Images
              </Button>
            </div>
          )}

          {/* 1. PDF VIEWER SECTION */}
          {(contentFilter === "all" || contentFilter === "pdfs") && pdfs.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {pdfs.length > 1 ? `PDF Documents (${pdfs.length})` : activePdf?.fileName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activePdf ? `${formatBytes(activePdf.sizeBytes)} · Built-in PDF reader` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Multi-PDF Selector if more than 1 PDF */}
                  {pdfs.length > 1 && (
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[280px] p-1 rounded-lg border bg-muted/40">
                      {pdfs.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPdfId(p.id)}
                          className={cn(
                            "truncate max-w-[120px] px-2.5 py-1 text-xs rounded-md font-medium transition-colors",
                            p.id === activePdf?.id ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
                          )}
                          title={p.fileName}
                        >
                          Doc {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {activePdf?.url && (
                    <>
                      <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                        <a href={activePdf.url} target="_blank" rel="noreferrer" download={activePdf.fileName}>
                          <Download className="size-3.5" /> Download
                        </a>
                      </Button>
                      <Button asChild variant="secondary" size="sm" className="gap-1.5 text-xs">
                        <a href={activePdf.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-3.5" /> Open Tab
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {activePdf?.url ? (
                <div className="relative overflow-hidden rounded-2xl border border-border shadow-sm bg-neutral-900/5 dark:bg-neutral-900/40">
                  <iframe
                    src={activePdf.url}
                    title={activePdf.fileName}
                    className="w-full h-[650px] lg:h-[750px] border-0 rounded-2xl bg-white"
                  />
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground rounded-xl border">
                  PDF preview link is generating or expired. Please refresh the page.
                </div>
              )}
            </div>
          )}

          {/* 2. SEQUENTIAL IMAGE NOTEBOOK SECTION */}
          {(contentFilter === "all" || contentFilter === "images") && images.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Lecture & Study Notebook ({images.length} {images.length === 1 ? "page" : "pages"})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Sequential multi-page notes · Read in continuous scroll or slide focus
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Arrange Pages toggle */}
                  <Button
                    variant={isArrangeOpen ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => setIsArrangeOpen((v) => !v)}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    {isArrangeOpen ? "Done Arranging" : "Arrange Order"}
                  </Button>

                  {/* Mode switch */}
                  <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("continuous")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        viewMode === "continuous" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <List className="size-3.5" /> Continuous
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("slide")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        viewMode === "slide" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Grid className="size-3.5" /> Page by Page
                    </button>
                  </div>

                  {/* Zoom controls */}
                  <div className="hidden sm:flex items-center gap-1 rounded-lg border bg-surface px-1 py-0.5 text-xs">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      disabled={zoomLevel <= 0.75}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title="Zoom Out"
                    >
                      <ZoomOut className="size-3.5" />
                    </button>
                    <span className="w-9 text-center font-mono text-[11px] font-semibold text-muted-foreground">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      disabled={zoomLevel >= 2.5}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title="Zoom In"
                    >
                      <ZoomIn className="size-3.5" />
                    </button>
                    {zoomLevel !== 1 && (
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Reset Zoom"
                      >
                        <RotateCcw className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* REORDER / ARRANGE ORDER PANEL */}
              {isArrangeOpen && (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
                        Reorder Pages
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Use the arrows to adjust page sequence so your notes read in chronological order.
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setIsArrangeOpen(false)} className="text-xs">
                      Done
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-lg border bg-surface shadow-xs"
                      >
                        <div className="relative w-full aspect-3/4 rounded overflow-hidden bg-muted">
                          {img.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={img.url} alt="" className="size-full object-cover" />
                          ) : null}
                          <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">
                            #{idx + 1}
                          </span>
                        </div>
                        <span className="truncate w-full text-center text-[11px] font-medium text-muted-foreground">
                          {img.fileName}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => moveImage(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 text-foreground transition-colors"
                            title="Move Earlier"
                          >
                            <MoveUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(idx, idx + 1)}
                            disabled={idx === images.length - 1}
                            className="p-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 text-foreground transition-colors"
                            title="Move Later"
                          >
                            <MoveDown className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODE A: CONTINUOUS NOTEBOOK VIEW (All pages stacked in sequence) */}
              {viewMode === "continuous" && (
                <div className="space-y-6">
                  {/* Floating Page Quick-Jump Navigation Bar */}
                  {images.length > 1 && (
                    <div className="sticky top-16 z-20 flex items-center justify-center py-2">
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border/80 bg-background/90 shadow-card backdrop-blur-md overflow-x-auto max-w-full">
                        <span className="text-xs font-semibold text-muted-foreground mr-1.5">Pages:</span>
                        {images.map((_, idx) => (
                          <a
                            key={idx}
                            href={`#notebook-page-${idx + 1}`}
                            className="size-6.5 text-xs font-semibold rounded-full grid place-items-center bg-muted/80 hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pages Stack */}
                  <div className="space-y-8 max-w-3xl mx-auto">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        id={`notebook-page-${idx + 1}`}
                        className="scroll-mt-28 rounded-2xl border border-border/80 bg-card overflow-hidden shadow-card transition-shadow hover:shadow-elevated"
                      >
                        {/* Page Header */}
                        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                              Page {idx + 1}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium truncate max-w-[200px]">
                              {img.fileName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatBytes(img.sizeBytes)}</span>
                            {img.url && (
                              <button
                                type="button"
                                onClick={() => setFullscreenImage(img.url)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                title="Expand Fullscreen"
                              >
                                <Maximize2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Page Content */}
                        <div className="p-2 sm:p-4 bg-muted/10 flex justify-center overflow-auto">
                          {img.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={img.url}
                              alt={`Note Page ${idx + 1}`}
                              style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}
                              className="max-w-full h-auto rounded-lg object-contain cursor-zoom-in transition-transform duration-150"
                              onClick={() => setFullscreenImage(img.url)}
                            />
                          ) : (
                            <div className="p-12 text-center text-sm text-muted-foreground">
                              Image unavailable
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODE B: SLIDE / PAGE-BY-PAGE FOCUS VIEW */}
              {viewMode === "slide" && images[currentPage] && (
                <div className="space-y-4 max-w-3xl mx-auto">
                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-200"
                      style={{ width: `${((currentPage + 1) / images.length) * 100}%` }}
                    />
                  </div>

                  {/* Main Slide Card */}
                  <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-card">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                          Page {currentPage + 1} of {images.length}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {images[currentPage]?.fileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFullscreenImage(images[currentPage]?.url ?? null)}
                          className="gap-1 text-xs h-7"
                        >
                          <Maximize2 className="size-3" /> Fullscreen
                        </Button>
                      </div>
                    </div>

                    {/* Image Viewer Container */}
                    <div className="relative min-h-[450px] p-4 bg-muted/10 flex items-center justify-center overflow-auto">
                      {images[currentPage]?.url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={images[currentPage].url}
                          alt={`Page ${currentPage + 1}`}
                          style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center" }}
                          className="max-h-[70vh] max-w-full rounded-lg object-contain cursor-zoom-in transition-transform duration-150 shadow-sm"
                          onClick={() => setFullscreenImage(images[currentPage]?.url ?? null)}
                        />
                      ) : null}

                      {/* Navigation arrow buttons overlay */}
                      {currentPage > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => p - 1)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/90 text-foreground border shadow-elevated grid place-items-center hover:bg-background transition-transform active:scale-95"
                          title="Previous Page (Left Arrow)"
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                      )}
                      {currentPage < images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => p + 1)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/90 text-foreground border shadow-elevated grid place-items-center hover:bg-background transition-transform active:scale-95"
                          title="Next Page (Right Arrow)"
                        >
                          <ChevronRight className="size-5" />
                        </button>
                      )}
                    </div>

                    {/* Footer Controls */}
                    <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        className="gap-1 text-xs"
                      >
                        <ChevronLeft className="size-3.5" /> Previous Page
                      </Button>

                      <span className="text-xs font-semibold text-muted-foreground">
                        Use Left / Right arrow keys to navigate
                      </span>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === images.length - 1}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="gap-1 text-xs"
                      >
                        Next Page <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Thumbnail Carousel Strip */}
                  <div className="p-3 rounded-xl border bg-surface/50 overflow-x-auto">
                    <div className="flex items-center gap-2">
                      {images.map((img, idx) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setCurrentPage(idx)}
                          className={cn(
                            "relative shrink-0 w-16 aspect-3/4 rounded-lg overflow-hidden border-2 transition-all",
                            currentPage === idx
                              ? "border-primary ring-2 ring-primary/30 scale-105 shadow-md"
                              : "border-border/70 opacity-60 hover:opacity-100",
                          )}
                        >
                          {img.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={img.url} alt="" className="size-full object-cover" />
                          ) : null}
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] font-bold py-0.5 text-center">
                            p.{idx + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. WRITTEN NOTES / MARKDOWN SECTION */}
          {(contentFilter === "all" || contentFilter === "text") && hasText && (
            <Card>
              <CardHeader className="border-b py-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="size-4 text-primary" />
                  Written Study Notes & Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 pb-8">
                <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">
                  {note.body}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* EDIT & ATTACHMENTS MODE */
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Edit Resource Information</CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <NoteForm
                key={note.updated_at}
                noteId={note.id}
                defaultValues={{
                  title: note.title,
                  subject: note.subject,
                  chapter: note.chapter,
                  body: note.body,
                  tags: note.tags.join(", "),
                }}
                suggestions={{
                  subjects: taxonomy.subjects.map((s) => s.name).filter(Boolean),
                  chapters: [
                    ...new Set(
                      taxonomy.subjects
                        .flatMap((s) => s.chapters.map((c) => c.name))
                        .filter(Boolean),
                    ),
                  ],
                }}
              />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Attached Files</span>
                <Badge tone="neutral">{note.files.length} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NoteAttachments noteId={note.id} ownerId={ownerId} files={note.files} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/20 text-white grid place-items-center hover:bg-white/30 transition-colors"
            title="Close Fullscreen (Esc)"
          >
            <Minimize2 className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt="Fullscreen view"
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
