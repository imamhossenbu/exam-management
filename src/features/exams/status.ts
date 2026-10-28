import type { BadgeTone } from "@/components/ui/badge";
import type { Enums } from "@/types/database";

export type ExamPhase = "draft" | "scheduled" | "live" | "ended" | "closed" | "archived";

/** Effective phase combining stored status with the exam window. */
export function examPhase(exam: { status: Enums<"exam_status">; starts_at: string; ends_at: string }, now: number): ExamPhase {
  if (exam.status === "draft") return "draft";
  if (exam.status === "archived") return "archived";
  if (exam.status === "closed") return "closed";
  if (now < new Date(exam.starts_at).getTime()) return "scheduled";
  if (now < new Date(exam.ends_at).getTime()) return "live";
  return "ended";
}

export const PHASE_META: Record<ExamPhase, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  live: { label: "Live", tone: "success" },
  ended: { label: "Ended", tone: "warning" },
  closed: { label: "Closed", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
};

export const EXAM_TYPE_LABEL: Record<Enums<"exam_type">, string> = { mcq: "MCQ", cq: "Written (CQ)", mixed: "Mixed" };

export const RELEASE_LABEL: Record<Enums<"results_release">, string> = {
  immediate: "As soon as graded",
  after_close: "After the exam window closes",
  manual: "When I publish them",
};

export const GRADING_META: Record<Enums<"grading_status">, { label: string; tone: BadgeTone }> = {
  pending: { label: "Needs grading", tone: "warning" },
  in_review: { label: "Grading in progress", tone: "info" },
  graded: { label: "Graded", tone: "success" },
};
