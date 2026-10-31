"use client";

import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormError } from "@/components/ui/field";
import { Checkbox, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { examSettingsSchema, type ExamSettingsInput, type ExamSettingsOutput } from "@/lib/validations/exams";
import { formatMinutes } from "@/lib/utils/datetime";
import { RELEASE_LABEL } from "../status";
import { createExamAction, updateExamAction } from "../actions";
import type { CourseOption } from "@/features/courses/queries";
import { T, useT } from "@/lib/i18n/client";
import { trChildren } from "@/lib/i18n/tr";

type Props = {
  courses: CourseOption[];
  defaultValues: ExamSettingsInput;
  examId?: string;
  /** Published/attempted exams freeze scoring-related settings. */
  locked?: boolean;
  timezone: string;
};

function CheckboxField({ id, label, description, disabled, ...rest }: { id: string; label: string; description?: string; disabled?: boolean } & React.ComponentProps<typeof Checkbox>) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} disabled={disabled} className="mt-0.5" aria-describedby={description ? `${id}-d` : undefined} {...rest} />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description ? (
          <p id={`${id}-d`} className="mt-1 text-xs text-muted-foreground">
            {trChildren(description)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const zod = zodResolver(examSettingsSchema);

export function ExamSettingsForm({ courses, defaultValues, examId, locked = false, timezone }: Props) {
  const t = useT();
  // react-hook-form reports disabled fields (locked settings, the course when editing, the
  // subject before a course is chosen) as undefined. Validate them with their original values.
  const resolver = React.useCallback<Resolver<ExamSettingsInput, unknown, ExamSettingsOutput>>(
    (values, context, options) => {
      const filled = { ...values } as Record<string, unknown>;
      for (const [key, value] of Object.entries(defaultValues)) if (filled[key] === undefined) filled[key] = value;
      return zod(filled as ExamSettingsInput, context, options);
    },
    [defaultValues],
  );
  const form = useForm<ExamSettingsInput, unknown, ExamSettingsOutput>({ resolver, defaultValues });
  const save = React.useCallback((v: ExamSettingsOutput) => (examId ? updateExamAction(examId, v) : createExamAction(v)), [examId]);
  const { run, pending } = useServerAction(save);
  const { errors, isDirty } = form.formState;

  const courseId = useWatch({ control: form.control, name: "courseId" });
  const subjectId = useWatch({ control: form.control, name: "subjectId" });
  const examType = useWatch({ control: form.control, name: "examType" });
  const chapterIds = useWatch({ control: form.control, name: "chapterIds" }) ?? [];
  const maxAttempts = Number(useWatch({ control: form.control, name: "maxAttempts" }) || 1);
  const durationMinutes = Number(useWatch({ control: form.control, name: "durationMinutes" }));
  const mcqMinutes = Number(useWatch({ control: form.control, name: "mcqDurationMinutes" }) || 0);
  const sectioned = examType === "mixed" && mcqMinutes > 0;

  const course = courses.find((c) => c.id === courseId);
  const subject = course?.subjects.find((s) => s.id === subjectId);
  const chapters = subject ? [...subject.chapters].sort((a, b) => a.position - b.position) : [];
  const activeCourses = courses.filter((c) => !c.archived_at || c.id === defaultValues.courseId);

  function toggleChapter(id: string, checked: boolean) {
    const next = checked ? [...chapterIds, id] : chapterIds.filter((c) => c !== id);
    form.setValue("chapterIds", next, { shouldDirty: true });
  }

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await run(values);
        applyFieldErrors(form.setError, result);
        if (result?.ok) form.reset(form.getValues());
      })}
    >
      {locked ? (
        <div role="note" className="flex gap-2 rounded-md border bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <T>This exam is published. Scoring settings (type, marks, duration, MCQ section time, shuffling) are frozen to protect attempts. You can still edit the text, extend the end
          time, and change result settings. Duplicate the exam to make a revised version.</T>
        </div>
      ) : null}
      <FormError message={errors.root?.message} />

      <Card>
        <CardHeader>
          <CardTitle><T>Basics</T></CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field id="title" label="Title" required error={errors.title?.message} className="md:col-span-2">
            {(a) => <Input placeholder="e.g. Physics — Chapter 3 class test" {...a} {...form.register("title")} />}
          </Field>
          <Field id="courseId" label="Course" required error={errors.courseId?.message} description={examId ? "The course can't change after creation." : undefined}>
            {(a) => (
              <NativeSelect
                {...a}
                disabled={Boolean(examId)}
                {...form.register("courseId", {
                  onChange: () => {
                    form.setValue("subjectId", "");
                    form.setValue("chapterIds", []);
                  },
                })}
              >
                <option value="">Select a course</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="subjectId" label="Subject" error={errors.subjectId?.message} description={course && course.subjects.length === 0 ? "Add subjects on the course page." : undefined}>
            {(a) => (
              <NativeSelect {...a} disabled={!course} {...form.register("subjectId", { onChange: () => form.setValue("chapterIds", []) })}>
                <option value="">No subject</option>
                {course?.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {chapters.length > 0 ? (
            <fieldset className="md:col-span-2">
              <legend className="mb-2 text-sm font-medium"><T>Chapters covered</T></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {chapters.map((ch) => (
                  <label key={ch.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={chapterIds.includes(ch.id)} onChange={(e) => toggleChapter(ch.id, e.target.checked)} />
                    {ch.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Field id="description" label="Description" error={errors.description?.message} className="md:col-span-2">
            {(a) => <Textarea rows={2} placeholder="A short summary students see in the exam list" {...a} {...form.register("description")} />}
          </Field>
          <Field id="instructions" label="Instructions for students" description="Shown before the student starts and during the exam." error={errors.instructions?.message} className="md:col-span-2">
            {(a) => <Textarea rows={5} placeholder={"e.g. Answer all questions.\nUpload clear photos of each answer page.\nCalculators are not allowed."} {...a} {...form.register("instructions")} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><T>Format and scoring</T></CardTitle>
          <CardDescription><T>Question marks must add up to the total before you can publish.</T></CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="examType" label="Exam type" required error={errors.examType?.message}>
            {(a) => (
              <NativeSelect {...a} disabled={locked} {...form.register("examType")}>
                <option value="mcq">MCQ only</option>
                <option value="cq">Written (CQ) only</option>
                <option value="mixed">Mixed (MCQ + CQ)</option>
              </NativeSelect>
            )}
          </Field>
          <Field id="totalMarks" label="Total marks" required error={errors.totalMarks?.message}>
            {(a) => <Input type="number" step="0.25" min="0.25" inputMode="decimal" placeholder="e.g. 50" disabled={locked} {...a} {...form.register("totalMarks")} />}
          </Field>
          <Field id="passMarks" label="Pass mark" description="Optional" error={errors.passMarks?.message}>
            {(a) => <Input type="number" step="0.25" min="0" inputMode="decimal" placeholder="Optional, e.g. 20" {...a} {...form.register("passMarks")} />}
          </Field>
          <Field id="maxAttempts" label="Attempts allowed" required error={errors.maxAttempts?.message}>
            {(a) => <Input type="number" min="1" max="20" inputMode="numeric" placeholder="1" {...a} {...form.register("maxAttempts")} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><T>Timing</T></CardTitle>
          <CardDescription>
            <T vars={{ timezone }}>{"Times are in your timezone ({timezone}). Each attempt ends at whichever comes first: start + duration, or the window end."}</T>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field id="startsAt" label="Opens" required error={errors.startsAt?.message}>
            {(a) => <Input type="datetime-local" {...a} {...form.register("startsAt")} />}
          </Field>
          <Field id="endsAt" label="Closes" required error={errors.endsAt?.message}>
            {(a) => <Input type="datetime-local" {...a} {...form.register("endsAt")} />}
          </Field>
          <Field id="durationMinutes" label={examType === "mixed" ? "Total duration (minutes)" : "Duration (minutes)"} required error={errors.durationMinutes?.message}>
            {(a) => <Input type="number" min="1" max="1440" inputMode="numeric" placeholder="e.g. 60" disabled={locked} {...a} {...form.register("durationMinutes")} />}
          </Field>
          {examType === "mixed" ? (
            <div className="grid gap-4 rounded-md border bg-muted/40 p-4 sm:col-span-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
              <Field
                id="mcqDurationMinutes"
                label="MCQ section time (minutes)"
                error={errors.mcqDurationMinutes?.message}
                description="Optional. Leave empty for one shared timer."
              >
                {(a) => <Input type="number" min="1" max="1439" inputMode="numeric" placeholder="e.g. 30" disabled={locked} {...a} {...form.register("mcqDurationMinutes")} />}
              </Field>
              <div className="text-sm sm:pt-6" aria-live="polite">
                {sectioned && durationMinutes > mcqMinutes ? (
                  <>
                    <p className="font-medium">
                      {t("MCQ {mcq}, then written part {written}", { mcq: formatMinutes(mcqMinutes), written: formatMinutes(durationMinutes - mcqMinutes) })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <T>Students answer all MCQs first. When the MCQ time is up — or they hand the section in early — their MCQ answers lock and the written
                      questions open. Time saved on MCQs carries over to the written part.</T>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Like a board exam: give MCQs their own fixed time. Students answer MCQs first; when that time ends the MCQ answers lock and the rest of the
                    duration is for the written part.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><T>Delivery and results</T></CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <CheckboxField id="shuffleQuestions" label="Shuffle question order" description="Each student gets a different order." disabled={locked} {...form.register("shuffleQuestions")} />
            <CheckboxField id="shuffleOptions" label="Shuffle MCQ options" description="Option order is randomised per attempt." disabled={locked} {...form.register("shuffleOptions")} />
          </div>
          <Field id="resultsRelease" label="Release results" error={errors.resultsRelease?.message} className="max-w-md">
            {(a) => (
              <NativeSelect {...a} {...form.register("resultsRelease")}>
                {Object.entries(RELEASE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {maxAttempts > 1 ? (
            <Field
              id="resultPolicy"
              label="Which attempt counts"
              description="Used for the student's result, averages and pass rates when they take the exam more than once."
              error={errors.resultPolicy?.message}
              className="max-w-md"
            >
              {(a) => (
                <NativeSelect {...a} {...form.register("resultPolicy")}>
                  <option value="best">Best attempt (highest score)</option>
                  <option value="latest">Latest attempt</option>
                </NativeSelect>
              )}
            </Field>
          ) : null}
          <CheckboxField
            id="revealAnswers"
            label="Show correct answers and explanations with results"
            description="Never revealed until the exam window has closed for everyone."
            {...form.register("revealAnswers")}
          />
          {examType !== "mcq" ? (
            <div>
              <CheckboxField
                id="allowResubmission"
                label="Allow returning written work for correction"
                description="You can send a graded attempt back so the student uploads corrected answer sheets by a new deadline."
                {...form.register("allowResubmission")}
              />
              {errors.allowResubmission?.message ? <p className="mt-1 text-xs text-danger">{errors.allowResubmission.message}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" pending={pending} disabled={Boolean(examId) && !isDirty}>
          {examId ? "Save settings" : "Create exam and add questions"}
        </Button>
      </div>
    </form>
  );
}
