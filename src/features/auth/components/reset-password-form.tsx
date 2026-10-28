"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { resetPasswordAction } from "@/features/auth/actions";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";

export function ResetPasswordForm() {
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const { run, pending } = useServerAction(resetPasswordAction, { successMessage: "Password updated" });
  const { errors } = form.formState;
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
      <Field id="password" label="New password" description="At least 8 characters." error={errors.password?.message}>
        {(a) => <PasswordInput autoComplete="new-password" placeholder="Create a strong password" {...a} {...form.register("password")} />}
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        {(a) => <PasswordInput autoComplete="new-password" placeholder="Re-enter the new password" {...a} {...form.register("confirmPassword")} />}
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" pending={pending}>
        Update password
      </Button>
    </form>
  );
}
