"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Mail, User } from "lucide-react";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { signUpAction } from "@/features/auth/actions";
import { signUpSchema, type SignUpInput } from "@/lib/validations/auth";

export function SignUpForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });
  const { run, pending } = useServerAction(signUpAction, { onSuccess: () => setSentTo(form.getValues("email")) });
  const { errors } = form.formState;

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-success/15 ring-1 ring-success/30">
          <MailCheck className="size-8 text-success" aria-hidden />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-white">Check your inbox</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/75">
          We sent a confirmation link to
          <br />
          <span className="font-medium text-white">{sentTo}</span>
        </p>
        <ol className="mt-6 w-full space-y-2.5 rounded-xl border border-white/10 bg-white/5 p-4 text-left text-sm text-white/80">
          <li>1. Open the email from ExamDesk.</li>
          <li>2. Click <span className="font-medium text-white">Confirm my email</span>.</li>
          <li>3. Join your course with your teacher&apos;s invitation code.</li>
        </ol>
        <p className="mt-4 text-xs text-white/55">Can&apos;t find it? Check your spam or promotions folder.</p>
      </div>
    );
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
      <Field id="fullName" label="Full name" error={errors.fullName?.message}>
        {(a) => <IconInput icon={User} autoComplete="name" placeholder="e.g. Ayesha Rahman" {...a} {...form.register("fullName")} />}
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        {(a) => <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...a} {...form.register("email")} />}
      </Field>
      <Field id="password" label="Password" description="At least 8 characters." error={errors.password?.message}>
        {(a) => <PasswordInput autoComplete="new-password" placeholder="Create a strong password" {...a} {...form.register("password")} />}
      </Field>
      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
        {(a) => <PasswordInput autoComplete="new-password" placeholder="Re-enter your password" {...a} {...form.register("confirmPassword")} />}
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" pending={pending}>
        Create student account
      </Button>
    </form>
  );
}
