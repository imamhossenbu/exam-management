"use client";

import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { questionSchema, type QuestionInput, type QuestionOutput } from "@/lib/validations/exams";
import type { Enums } from "@/types/database";
import { saveQuestionAction } from "../actions";
import type { BuilderQuestion } from "../queries";
import { QuestionImageUpload } from "./question-image-upload";

const EMPTY_MCQ: QuestionInput = {
  type: "mcq",
  body: "",
  imagePath: null,
  marks: "1",
  negativeMarks: "0",
  options: [{ body: "" }, { body: "" }, { body: "" }, { body: "" }],
  correctIndex: -1,
  parts: [],
  explanation: "",
  modelAnswer: "",
  rubric: "",
  sourceId: null,
};

export function questionToInput(q: BuilderQuestion): QuestionInput {
  return {
    type: q.type,
    body: q.body,
    imagePath: q.imagePath,
    marks: String(q.marks),
    negativeMarks: String(q.negativeMarks),
    options: q.options.map((o) => ({ body: o.body })),
    correctIndex: q.correctIndex,
    parts: q.parts.map((p) => ({ label: p.label, body: p.body, marks: String(p.marks) })),
    explanation: q.explanation,
    modelAnswer: q.modelAnswer,
    rubric: q.rubric,
    sourceId: q.sourceId,
  };
}

export function blankQuestion(examType: Enums<"exam_type">): QuestionInput {
  return examType === "cq" ? { ...EMPTY_MCQ, type: "cq", options: [] } : EMPTY_MCQ;
}

type Props = {
  examId: string;
  examType: Enums<"exam_type">;
  trigger: React.ReactNode;
  question?: BuilderQuestion;
  initial?: QuestionInput;
};

export function QuestionEditorDialog({ examId, examType, trigger, question, initial }: Props) {
  const [open, setOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(question?.imageUrl ?? null);
  const defaults = React.useMemo(() => initial ?? (question ? questionToInput(question) : blankQuestion(examType)), [initial, question, examType]);
  const form = useForm<QuestionInput, unknown, QuestionOutput>({ resolver: zodResolver(questionSchema), defaultValues: defaults });
  const options = useFieldArray({ control: form.control, name: "options" });
  const parts = useFieldArray({ control: form.control, name: "parts" });
  const save = React.useCallback((v: QuestionOutput) => saveQuestionAction(examId, question?.id ?? null, v), [examId, question?.id]);
  const { run, pending } = useServerAction(save);

  const type = useWatch({ control: form.control, name: "type" });
  const correctIndex = Number(useWatch({ control: form.control, name: "correctIndex" }));
  const imagePath = useWatch({ control: form.control, name: "imagePath" }) ?? null;
  const { errors } = form.formState;

  function switchType(next: "mcq" | "cq") {
    form.setValue("type", next);
    if (next === "mcq" && options.fields.length === 0) options.replace([{ body: "" }, { body: "" }, { body: "" }, { body: "" }]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          form.reset(defaults);
          setPreviewUrl(question?.imageUrl ?? null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Answer keys, explanations and rubrics are private and never sent to students before release.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            const result = await run(values);
            applyFieldErrors(form.setError, result);
            if (result?.ok) setOpen(false);
          })}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="q-type" label="Type">
              {(a) => (
                <NativeSelect {...a} value={type} disabled={examType !== "mixed"} onChange={(e) => switchType(e.target.value as "mcq" | "cq")}>
                  <option value="mcq">Multiple choice</option>
                  <option value="cq">Written (CQ)</option>
                </NativeSelect>
              )}
            </Field>
            <Field id="q-marks" label="Marks" required error={errors.marks?.message}>
              {(a) => <Input type="number" step="0.25" min="0.25" inputMode="decimal" placeholder="e.g. 2" {...a} {...form.register("marks")} />}
            </Field>
            {type === "mcq" ? (
              <Field id="q-negative" label="Negative marks" description="Deducted for a wrong answer." error={errors.negativeMarks?.message}>
                {(a) => <Input type="number" step="0.25" min="0" inputMode="decimal" placeholder="0" {...a} {...form.register("negativeMarks")} />}
              </Field>
            ) : null}
          </div>

          <Field id="q-body" label="Question" required error={errors.body?.message}>
            {(a) => <Textarea rows={4} placeholder="Type the question exactly as students should see it" {...a} {...form.register("body")} />}
          </Field>

          <QuestionImageUpload
            examId={examId}
            value={imagePath}
            previewUrl={previewUrl}
            onChange={(path, url) => {
              form.setValue("imagePath", path, { shouldDirty: true });
              setPreviewUrl(url);
            }}
          />

          {type === "mcq" ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                Options <span className="font-normal text-muted-foreground">— select the correct one</span>
              </legend>
              {options.fields.map((field, i) => (
                <div key={field.id} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    className="mt-2.5 size-4 accent-primary"
                    checked={correctIndex === i}
                    onChange={() => form.setValue("correctIndex", i, { shouldDirty: true, shouldValidate: true })}
                    aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct`}
                  />
                  <span className="mt-2 w-5 text-sm font-medium text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                  <div className="flex-1">
                    <Input
                      aria-label={`Option ${String.fromCharCode(65 + i)}`}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      aria-invalid={Boolean(errors.options?.[i]?.body)}
                      {...form.register(`options.${i}.body`)}
                    />
                    {errors.options?.[i]?.body ? <p className="mt-1 text-xs text-danger">{errors.options[i]?.body?.message}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${String.fromCharCode(65 + i)}`}
                    disabled={options.fields.length <= 2}
                    onClick={() => {
                      options.remove(i);
                      if (correctIndex === i) form.setValue("correctIndex", -1);
                      else if (correctIndex > i) form.setValue("correctIndex", correctIndex - 1);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {errors.options?.message || errors.correctIndex?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.options?.message ?? errors.correctIndex?.message}
                </p>
              ) : null}
              <div>
                <Button type="button" variant="outline" size="sm" disabled={options.fields.length >= 10} onClick={() => options.append({ body: "" })}>
                  <Plus aria-hidden /> Add option
                </Button>
              </div>
            </fieldset>
          ) : (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">
                Sub-questions <span className="font-normal text-muted-foreground">— optional; their marks must add up to the question&apos;s marks</span>
              </legend>
              {parts.fields.map((field, i) => (
                <div key={field.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[5rem_1fr_6rem_auto]">
                  <div>
                    <Label htmlFor={`part-label-${i}`} className="text-xs">
                      Label
                    </Label>
                    <Input id={`part-label-${i}`} placeholder="a" {...form.register(`parts.${i}.label`)} />
                  </div>
                  <div>
                    <Label htmlFor={`part-body-${i}`} className="text-xs">
                      Sub-question
                    </Label>
                    <Input id={`part-body-${i}`} aria-invalid={Boolean(errors.parts?.[i]?.body)} placeholder="Sub-question text" {...form.register(`parts.${i}.body`)} />
                  </div>
                  <div>
                    <Label htmlFor={`part-marks-${i}`} className="text-xs">
                      Marks
                    </Label>
                    <Input id={`part-marks-${i}`} type="number" step="0.25" min="0.25" placeholder="Marks" {...form.register(`parts.${i}.marks`)} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`Remove sub-question ${i + 1}`} onClick={() => parts.remove(i)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {errors.parts?.message || errors.parts?.root?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.parts?.message ?? errors.parts?.root?.message}
                </p>
              ) : null}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={parts.fields.length >= 20}
                  onClick={() => parts.append({ label: String.fromCharCode(97 + parts.fields.length), body: "", marks: "1" })}
                >
                  <Plus aria-hidden /> Add sub-question
                </Button>
              </div>
            </fieldset>
          )}

          <div className="grid gap-4 rounded-md border border-dashed p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Private — teacher only</p>
            <Field id="q-explanation" label="Explanation" description="Shown to students only if you reveal answers after the exam closes.">
              {(a) => <Textarea rows={2} placeholder="Why the correct answer is correct" {...a} {...form.register("explanation")} />}
            </Field>
            {type === "cq" ? (
              <>
                <Field id="q-model" label="Model answer" description="Shown to students only if you reveal answers after the exam closes.">
                  {(a) => <Textarea rows={3} placeholder="An ideal answer, for your reference" {...a} {...form.register("modelAnswer")} />}
                </Field>
                <Field id="q-rubric" label="Marking rubric" description="Never shown to students.">
                  {(a) => <Textarea rows={3} placeholder="e.g. 2 marks for the diagram, 3 for the explanation" {...a} {...form.register("rubric")} />}
                </Field>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              {question ? "Save question" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
