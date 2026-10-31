"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { courseSchema, type CourseInput } from "@/lib/validations/courses";
import { createCourseAction, updateCourseAction } from "../actions";
import { T } from "@/lib/i18n/client";

type Props = {
  trigger: React.ReactNode;
  course?: { id: string; title: string; code: string | null; description: string };
};

export function CourseFormDialog({ trigger, course }: Props) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const defaults = { title: course?.title ?? "", code: course?.code ?? "", description: course?.description ?? "" };
  const form = useForm<CourseInput>({ resolver: zodResolver(courseSchema), defaultValues: defaults });
  const save = React.useCallback(
    (values: CourseInput) => (course ? updateCourseAction(course.id, values) : createCourseAction(values)),
    [course],
  );
  const { run, pending } = useServerAction(save);
  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "New course"}</DialogTitle>
          <DialogDescription><T>Courses group students, exams and subjects.</T></DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            const result = await run(values);
            applyFieldErrors(form.setError, result);
            if (result?.ok) {
              setOpen(false);
              if (!course && result.data && "id" in result.data) router.push(`/teacher/courses/${result.data.id}`);
            }
          })}
        >
          <Field id="course-title" label="Title" required error={errors.title?.message}>
            {(a) => <Input placeholder="e.g. Physics — Class 10" {...a} {...form.register("title")} />}
          </Field>
          <Field id="course-code" label="Course code" description="Optional short identifier." error={errors.code?.message}>
            {(a) => <Input placeholder="PHY-10" {...a} {...form.register("code")} />}
          </Field>
          <Field id="course-description" label="Description" error={errors.description?.message}>
            {(a) => <Textarea rows={4} placeholder="What this course covers, class timing, expectations…" {...a} {...form.register("description")} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" pending={pending}>
              {course ? "Save changes" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
