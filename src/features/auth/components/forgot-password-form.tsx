"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { run, pending } = useServerAction(requestPasswordResetAction, { onSuccess: () => setSent(true) });

  if (sent) {
    return (
      <p role="status" className="text-subtle text-center">
        If an account exists for that email, a reset link is on its way. The link expires after a short time.
      </p>
    );
  }
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
      <Field id="email" label="Email" error={form.formState.errors.email?.message}>
        {(a) => <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...a} {...form.register("email")} />}
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" pending={pending}>
        Send reset link
      </Button>
    </form>
  );
}
