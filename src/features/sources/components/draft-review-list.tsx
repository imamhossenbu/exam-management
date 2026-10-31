"use client";

import * as React from "react";
import { AlertTriangle, CheckCheck, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { useServerAction } from "@/components/forms/use-server-action";
import { questionSchema } from "@/lib/validations/exams";
import type { Enums } from "@/types/database";
import { importReviewedQuestionsAction } from "../actions";
import type { DraftQuestion } from "../parse-questions";
import { hasBengali, optionLabel } from "@/lib/utils/bangla";
import { T } from "@/lib/i18n/client";

export type EditableDraft = DraftQuestion & { key: string; reviewed: boolean; correctIndex: number; marksText: string };

export function toEditable(drafts: DraftQuestion[], examType: Enums<"exam_type">): EditableDraft[] {
  return drafts.map((d) => {
    const type = examType === "mcq" ? "mcq" : examType === "cq" ? "cq" : d.type;
    return {
      ...d,
      type,
      options: type === "mcq" && d.options.length < 2 ? [...d.options, "", ""].slice(0, Math.max(2, d.options.length)) : d.options,
      key: crypto.randomUUID(),
      reviewed: false,
      // Suggested answers from the source are pre-selected but still need review.
      correctIndex: d.suggestedCorrectIndex,
      marksText: d.marks ? String(d.marks) : "1",
    };
  });
}

function toInput(d: EditableDraft) {
  return {
    type: d.type,
    body: d.body,
    marks: d.marksText,
    negativeMarks: "0",
    options: d.type === "mcq" ? d.options.map((body) => ({ body })) : [],
    correctIndex: d.correctIndex,
    parts: [],
  };
}

export function DraftReviewList({
  examId,
  sourceId,
  examType,
  drafts,
  onChange,
  onImported,
}: {
  examId: string;
  sourceId: string | null;
  examType: Enums<"exam_type">;
  drafts: EditableDraft[];
  onChange: (next: EditableDraft[]) => void;
  onImported: () => void;
}) {
  const { run, pending } = useServerAction(importReviewedQuestionsAction);
  const update = (key: string, patch: Partial<EditableDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const reviewed = drafts.filter((d) => d.reviewed);
  const problems = new Map(
    drafts.map((d) => {
      const r = questionSchema.safeParse(toInput(d));
      return [d.key, r.success ? null : r.error.issues[0]?.message ?? "Invalid"];
    }),
  );
  const ready = reviewed.filter((d) => !problems.get(d.key));

  return (
    <div className="space-y-4">
      <div role="note" className="flex gap-2 rounded-md border bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <T>These drafts were detected automatically and may be wrong. Check each question, its options and the correct answer, then tick “Reviewed”.</T>
      </div>
      <ol className="space-y-3">
        {drafts.map((d, i) => {
          const problem = problems.get(d.key);
          return (
            <li key={d.key} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">Draft {i + 1}</span>
                <div className="flex items-center gap-2">
                  {problem ? <Badge tone="warning">{problem}</Badge> : <Badge tone="success"><T>Valid</T></Badge>}
                  <Button variant="ghost" size="icon-sm" aria-label={`Discard draft ${i + 1}`} onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[10rem_7rem]">
                <div>
                  <Label htmlFor={`d-type-${d.key}`} className="text-xs">
                    <T>Type</T>
                  </Label>
                  <NativeSelect
                    id={`d-type-${d.key}`}
                    value={d.type}
                    disabled={examType !== "mixed"}
                    onChange={(e) => {
                      const type = e.target.value as "mcq" | "cq";
                      update(d.key, { type, options: type === "mcq" && d.options.length < 2 ? ["", ""] : d.options, reviewed: false });
                    }}
                  >
                    <option value="mcq">Multiple choice</option>
                    <option value="cq">Written</option>
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor={`d-marks-${d.key}`} className="text-xs">
                    <T>Marks</T>
                  </Label>
                  <Input id={`d-marks-${d.key}`} type="number" step="0.25" min="0.25" value={d.marksText} onChange={(e) => update(d.key, { marksText: e.target.value, reviewed: false })} />
                </div>
              </div>
              <div>
                <Label htmlFor={`d-body-${d.key}`} className="text-xs">
                  <T>Question</T>
                </Label>
                <Textarea id={`d-body-${d.key}`} rows={3} placeholder="Question text" value={d.body} onChange={(e) => update(d.key, { body: e.target.value, reviewed: false })} />
              </div>
              {d.type === "mcq" ? (
                <fieldset className="grid gap-2">
                  <legend className="text-xs font-medium"><T>Options — select the correct one</T></legend>
                  {d.options.map((opt, oi, all) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`d-correct-${d.key}`}
                        className="size-4 accent-primary"
                        checked={d.correctIndex === oi}
                        onChange={() => update(d.key, { correctIndex: oi, reviewed: false })}
                        aria-label={`Option ${optionLabel(oi, hasBengali(d.body, ...all))} is correct`}
                      />
                      <Input
                        aria-label={`Option ${optionLabel(oi, hasBengali(d.body, ...all))}`}
                        placeholder={`Option ${optionLabel(oi, hasBengali(d.body, ...all))}`}
                        value={opt}
                        onChange={(e) => update(d.key, { options: d.options.map((o, j) => (j === oi ? e.target.value : o)), reviewed: false })}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove option ${optionLabel(oi, hasBengali(d.body, ...all))}`}
                        disabled={d.options.length <= 2}
                        onClick={() =>
                          update(d.key, {
                            options: d.options.filter((_, j) => j !== oi),
                            correctIndex: d.correctIndex === oi ? -1 : d.correctIndex > oi ? d.correctIndex - 1 : d.correctIndex,
                            reviewed: false,
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button variant="outline" size="sm" disabled={d.options.length >= 10} onClick={() => update(d.key, { options: [...d.options, ""], reviewed: false })}>
                      <Plus aria-hidden /> <T>Option</T>
                    </Button>
                  </div>
                </fieldset>
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={d.reviewed} disabled={Boolean(problem)} onChange={(e) => update(d.key, { reviewed: e.target.checked })} />
                <T>Reviewed — this question is correct</T>
              </label>
            </li>
          );
        })}
      </ol>
      <div className="surface sticky bottom-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-semibold">{ready.length}</span> of {drafts.length} drafts reviewed and valid
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onChange(drafts.map((d) => ({ ...d, reviewed: !problems.get(d.key) })))}>
            <CheckCheck aria-hidden /> <T>Mark all valid as reviewed</T>
          </Button>
          <Button
            pending={pending}
            disabled={ready.length === 0}
            onClick={async () => {
              const r = await run(examId, sourceId, ready.map(toInput));
              if (r?.ok) {
                onChange(drafts.filter((d) => !ready.includes(d)));
                onImported();
              }
            }}
          >
            Add {ready.length} to exam
          </Button>
        </div>
      </div>
    </div>
  );
}
