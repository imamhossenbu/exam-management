"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Images,
  Loader2,
  Maximize2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_IMAGE_TYPES, LIMITS, extensionFor, formatBytes, validateFile } from "@/lib/utils/files";
import { formatDate } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils/cn";
import { createGalleryAlbumAction, deleteGalleryPhotoAction } from "../actions";
import { registerStudyFileAction } from "@/features/notes/actions";
import type { GalleryImage } from "../queries";
import { T, tNow } from "@/lib/i18n/client";

type Props = {
  photos: GalleryImage[];
  ownerId: string;
  subjects: { name: string; count: number }[];
  timezone: string;
};

export function GalleryView({ photos, ownerId, subjects, timezone }: Props) {
  const router = useRouter();

  // Search & Filter state
  const [selectedSubject, setSelectedSubject] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  // Lightbox modal state
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = React.useState<number>(1);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = React.useState<boolean>(false);
  const [uploadTitle, setUploadTitle] = React.useState<string>("");
  const [uploadSubject, setUploadSubject] = React.useState<string>("General");
  const [selectedFiles, setSelectedFiles] = React.useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [isUploading, setIsUploading] = React.useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = React.useState<string>("");
  const [uploadPercent, setUploadPercent] = React.useState<number>(0);
  const [isDragOver, setIsDragOver] = React.useState<boolean>(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Suggested subjects for quick selection pills
  const suggestedSubjects = React.useMemo(() => {
    const defaults = ["Physics", "Chemistry", "Mathematics", "Biology", "General"];
    const existing = subjects.map((s) => s.name).filter(Boolean);
    const combined = Array.from(new Set([...defaults, ...existing]));
    return combined.slice(0, 6);
  }, [subjects]);

  // Filtered photos
  const filteredPhotos = React.useMemo(() => {
    return photos.filter((p) => {
      const matchSubject =
        selectedSubject === "all" || p.subject.toLowerCase() === selectedSubject.toLowerCase();
      const matchSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.subject.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSubject && matchSearch;
    });
  }, [photos, selectedSubject, searchQuery]);

  const activePhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  // Keyboard controls for lightbox
  React.useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setLightboxIndex((idx) => (idx !== null && idx < filteredPhotos.length - 1 ? idx + 1 : idx));
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((idx) => (idx !== null && idx > 0 ? idx - 1 : idx));
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, filteredPhotos.length]);

  function handleFilesSelected(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    const newItems: { id: string; file: File; previewUrl: string }[] = [];

    for (const f of list) {
      const problem = validateFile(f, ACCEPTED_IMAGE_TYPES, LIMITS.studyFile);
      if (problem) {
        toast.error(problem);
        continue;
      }
      newItems.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }

    if (newItems.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newItems]);
      if (!uploadTitle.trim() && newItems[0]) {
        // default title from first file name without extension
        const cleanName = newItems[0].file.name.replace(/\.[^/.]+$/, "");
        setUploadTitle(cleanName);
      }
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

  function handleCloseUpload() {
    if (isUploading) return;
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setSelectedFiles([]);
    setUploadTitle("");
    setUploadPercent(0);
    setUploadProgress("");
    setIsUploadOpen(false);
  }

  async function handleBatchUpload(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      toast.error(tNow("Please select at least one photo to upload."));
      return;
    }

    const titleToUse =
      uploadTitle.trim() ||
      (selectedFiles[0]?.file.name
        ? selectedFiles[0].file.name.replace(/\.[^/.]+$/, "")
        : `Study Photos · ${formatDate(new Date().toISOString(), timezone)}`);

    setIsUploading(true);
    setUploadPercent(5);
    setUploadProgress("Creating collection…");

    try {
      // 1. Create gallery collection note
      const albumRes = await createGalleryAlbumAction({
        title: titleToUse,
        subject: uploadSubject.trim() || "General",
        chapter: "Gallery Photos",
      });

      if (!albumRes.ok) {
        toast.error(albumRes.error || "Could not create gallery album.");
        setIsUploading(false);
        setUploadProgress("");
        setUploadPercent(0);
        return;
      }

      const noteId = albumRes.data.id;
      const supabase = createClient();
      let uploadedCount = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        const stepPct = Math.round(10 + ((i + 0.5) / selectedFiles.length) * 85);
        setUploadPercent(stepPct);
        setUploadProgress(tNow("Uploading photo {v0} of {v1}: {v2}\u2026", { v0: i + 1, v1: selectedFiles.length, v2: item.file.name }));

        const ext = extensionFor(item.file.type);
        const path = `${ownerId}/${noteId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("study-files")
          .upload(path, item.file, { contentType: item.file.type, upsert: false });

        if (upErr) {
          console.error(upErr);
          toast.error(tNow("Failed to upload {v0}", { v0: item.file.name }));
          continue;
        }

        const reg = await registerStudyFileAction({
          noteId,
          storagePath: path,
          fileName: item.file.name,
          mimeType: item.file.type,
          sizeBytes: item.file.size,
        }).catch(() => null);

        if (reg?.ok) uploadedCount++;
        const finishPct = Math.round(10 + ((i + 1) / selectedFiles.length) * 85);
        setUploadPercent(finishPct);
      }

      setUploadPercent(100);
      setUploadProgress("Done!");
      toast.success(tNow("Uploaded {v0} photo(s) to gallery!", { v0: uploadedCount }));
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setSelectedFiles([]);
      setUploadTitle("");
      setIsUploadOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(tNow("Something went wrong during upload."));
    } finally {
      setIsUploading(false);
      setUploadProgress("");
      setUploadPercent(0);
    }
  }

  async function handleDeletePhoto(id: string) {
    const res = await deleteGalleryPhotoAction(id);
    if (res.ok) {
      toast.success(tNow("Photo removed from gallery"));
      if (lightboxIndex !== null) setLightboxIndex(null);
      router.refresh();
      return true;
    }
    toast.error(res.error || "Could not delete photo.");
    return false;
  }

  return (
    <div className="space-y-6">
      {/* Search, Filter & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b pb-4">
        {/* Subject Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedSubject("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all",
              selectedSubject === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <T vars={{ n: photos.length }}>{"All Photos ({n})"}</T>
          </button>
          {subjects.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSelectedSubject(s.name)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all",
                selectedSubject.toLowerCase() === s.name.toLowerCase()
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name} ({s.count})
            </button>
          ))}
        </div>

        {/* Search & Upload Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search photos…"
              className="pl-8 h-9 text-xs"
            />
          </div>

          <Button onClick={() => setIsUploadOpen(true)} size="sm" className="gap-1.5 shrink-0 h-9">
            <Plus className="size-4" /> <T>Upload Photos</T>
          </Button>
        </div>
      </div>

      {/* PHOTO GRID */}
      {filteredPhotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/10">
          <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3 shadow-xs">
            <Images className="size-7" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            <T>{photos.length === 0 ? "Your Study Photo Gallery is Empty" : "No matching photos found"}</T>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {photos.length === 0
              ? "Upload photos of lecture whiteboards, handwritten notes, diagrams, and study slides to keep them organized."
              : "Try searching with different keywords or switch the subject filter."}
          </p>
          {photos.length === 0 ? (
            <Button onClick={() => setIsUploadOpen(true)} className="mt-5 gap-2" size="sm">
              <UploadCloud className="size-4" /> <T>Upload First Photos</T>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedSubject("all");
                setSearchQuery("");
              }}
              className="mt-4"
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              onClick={() => {
                setLightboxIndex(index);
                setZoomLevel(1);
              }}
              className="group relative flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs hover:shadow-card hover:border-primary/40 transition-all cursor-pointer focus-ring"
            >
              {/* Photo Image Aspect Container */}
              <div className="relative aspect-4/3 w-full overflow-hidden bg-muted/30">
                {photo.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.url}
                    alt={photo.fileName}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-full grid place-items-center text-xs text-muted-foreground">
                    <T>Image</T>
                  </div>
                )}

                {/* Hover overlay with expand button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <span className="p-2 rounded-full bg-white/20 text-white backdrop-blur-xs hover:bg-white/30">
                    <Maximize2 className="size-4" />
                  </span>
                </div>

                {/* Top Badge */}
                <div className="absolute top-1.5 left-1.5">
                  <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                    {photo.subject}
                  </span>
                </div>
              </div>

              {/* Photo Caption & Metadata */}
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {photo.title}
                </p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                  <span className="truncate max-w-[90px]">{photo.fileName}</span>
                  <span>{formatDate(photo.createdAt, timezone)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LIGHTBOX SLIDESHOW MODAL */}
      {activePhoto && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Lightbox Topbar */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-white">
              <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold">
                {lightboxIndex + 1} / {filteredPhotos.length}
              </span>
              <div>
                <p className="text-sm font-semibold truncate max-w-[200px] sm:max-w-md">
                  {activePhoto.title}
                </p>
                <p className="text-[11px] text-white/60">
                  {activePhoto.subject} · {formatBytes(activePhoto.sizeBytes)} · {activePhoto.fileName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="hidden sm:flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-white text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                  className="p-1 hover:text-primary disabled:opacity-40"
                  disabled={zoomLevel <= 0.75}
                  title="Zoom Out"
                >
                  <ZoomOut className="size-4" />
                </button>
                <span className="font-mono text-xs w-9 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
                  className="p-1 hover:text-primary disabled:opacity-40"
                  disabled={zoomLevel >= 2.5}
                  title="Zoom In"
                >
                  <ZoomIn className="size-4" />
                </button>
                {zoomLevel !== 1 && (
                  <button
                    type="button"
                    onClick={() => setZoomLevel(1)}
                    className="p-1 hover:text-primary"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Download original */}
              {activePhoto.url && (
                <a
                  href={activePhoto.url}
                  download={activePhoto.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Download photo"
                >
                  <Download className="size-4" />
                </a>
              )}

              {/* View Resource */}
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex gap-1.5 text-xs text-black bg-white hover:bg-white/90">
                <Link href={`/student/notes/${activePhoto.noteId}`}>
                  <ExternalLink className="size-3.5" /> <T>View Notebook</T>
                </Link>
              </Button>

              {/* Delete photo */}
              <ConfirmDialog
                title="Delete this photo?"
                description="This photo will be permanently removed from your study gallery."
                confirmLabel="Delete photo"
                destructive
                onConfirm={() => handleDeletePhoto(activePhoto.id)}
                trigger={
                  <button
                    type="button"
                    className="p-2 rounded-lg bg-white/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Delete photo"
                  >
                    <Trash2 className="size-4" />
                  </button>
                }
              />

              {/* Close Modal */}
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-2"
                title="Close (Esc)"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Main Stage */}
          <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
            {activePhoto.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={activePhoto.url}
                alt={activePhoto.fileName}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-[82vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-150"
                onClick={(e) => e.stopPropagation()}
              />
            ) : null}

            {/* Left / Right Nav Arrows */}
            {lightboxIndex > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(lightboxIndex - 1);
                  setZoomLevel(1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/15 text-white backdrop-blur-md grid place-items-center hover:bg-white/30 transition-transform active:scale-95"
                title="Previous photo (Left Arrow)"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}

            {lightboxIndex < filteredPhotos.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(lightboxIndex + 1);
                  setZoomLevel(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/15 text-white backdrop-blur-md grid place-items-center hover:bg-white/30 transition-transform active:scale-95"
                title="Next photo (Right Arrow)"
              >
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* UPLOAD PHOTOS MODAL */}
      <Dialog
        open={isUploadOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseUpload();
          else setIsUploadOpen(true);
        }}
      >
        <DialogContent size="md" className="max-h-[85vh] overflow-y-auto p-5 sm:p-6 gap-4">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Images className="size-5 text-primary" />
              <T>Upload Study Photos</T>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              <T>Add photos of whiteboard notes, lecture slides, formulas, or diagrams to your study gallery.</T>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchUpload} className="space-y-4">
            {/* Subject Selector with Quick Pills */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground"><T>Subject</T></label>
              <div className="flex flex-wrap items-center gap-1.5">
                {suggestedSubjects.map((sub) => {
                  const isSelected = uploadSubject.toLowerCase() === sub.toLowerCase();
                  return (
                    <button
                      key={sub}
                      type="button"
                      disabled={isUploading}
                      onClick={() => setUploadSubject(sub)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/70",
                      )}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
              <Input
                disabled={isUploading}
                value={uploadSubject}
                onChange={(e) => setUploadSubject(e.target.value)}
                placeholder="Or enter custom subject…"
                className="text-xs h-8 mt-1"
              />
            </div>

            {/* Collection / Topic Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span><T>Collection / Topic Title</T></span>
                <span className="text-[10px] text-muted-foreground font-normal"><T>Optional (auto-named from file if blank)</T></span>
              </label>
              <Input
                disabled={isUploading}
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Thermodynamics Slides, Math Formulas"
                className="text-xs h-8"
              />
            </div>

            {/* Dropzone */}
            {selectedFiles.length === 0 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.length) handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center",
                  isDragOver
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/50 bg-muted/20",
                  isUploading && "pointer-events-none opacity-60",
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => e.target.files?.length && handleFilesSelected(e.target.files)}
                />
                <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center mb-2">
                  <UploadCloud className="size-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  <T>Click or drag & drop multiple images here</T>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <T>PNG, JPG, or WebP up to 10MB each</T>
                </p>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.length) handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  "flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center",
                  isDragOver
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/50 bg-muted/20",
                  isUploading && "pointer-events-none opacity-60",
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => e.target.files?.length && handleFilesSelected(e.target.files)}
                />
                <Plus className="size-4 text-primary" />
                <span className="text-xs font-medium text-foreground"><T>Add more photos</T></span>
                <span className="text-[10px] text-muted-foreground">(click or drag & drop)</span>
              </div>
            )}

            {/* Selected Thumbnails */}
            {selectedFiles.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                    Selected Photos ({selectedFiles.length})
                  </span>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      selectedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
                      setSelectedFiles([]);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto p-2 rounded-xl border bg-muted/10">
                  {selectedFiles.map((item, idx) => (
                    <div
                      key={item.id}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border/80 bg-background shadow-2xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl} alt="" className="size-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.2 text-[9px] font-bold text-white backdrop-blur-xs">
                        #{idx + 1}
                      </span>
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(item.id)}
                          className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-destructive transition-all"
                          title="Remove photo"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-2 text-foreground truncate max-w-[280px]">
                    <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                    <span className="truncate">{uploadProgress || "Uploading photos…"}</span>
                  </span>
                  <span className="font-mono text-xs text-primary font-bold shrink-0">{uploadPercent}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Dialog Footer Actions */}
            <DialogFooter className="pt-2 border-t flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={handleCloseUpload}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isUploading || selectedFiles.length === 0}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span><T>Uploading…</T></span>
                  </>
                ) : (
                  `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""} to Gallery`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
