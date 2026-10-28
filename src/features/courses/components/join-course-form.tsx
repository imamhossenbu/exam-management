"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { joinCourseSchema, type JoinCourseInput } from "@/lib/validations/courses";
import { joinCourseAction } from "../actions";

export function JoinCourseForm() {
  const router = useRouter();
  const form = useForm<JoinCourseInput>({ resolver: zodResolver(joinCourseSchema), defaultValues: { code: "" } });
  const { run, pending } = useServerAction(joinCourseAction, { onSuccess: (d) => router.push(`/student/courses/${d.courseId}`) });
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
      <Field id="code" label="Invitation code" description="Example: K7QM-2XRP-9TDA. Letters aren't case-sensitive." error={form.formState.errors.code?.message}>
        {(a) => <Input placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono tracking-widest uppercase" {...a} {...form.register("code")} />}
      </Field>
      <Button type="submit" pending={pending}>
        {!pending ? <Ticket aria-hidden /> : null} Join course
      </Button>
    </form>
  );
}
