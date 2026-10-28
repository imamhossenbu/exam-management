"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleCheckBig, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { AuthCard } from "@/components/shared/auth-card";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { resetPasswordAction } from "@/features/auth/actions";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { PasswordStrength } from "./password-strength";

const REDIRECT_SECONDS = 4;

/** The whole "choose a new password" card, with a success screen that forwards to the dashboard. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [home, setHome] = React.useState<string | null>(null);
  const done = home !== null;
  const [remaining, setRemaining] = React.useState(REDIRECT_SECONDS);
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const { run, pending } = useServerAction(resetPasswordAction, { onSuccess: (data) => setHome(data.home) });
  const password = useWatch({ control: form.control, name: "password" }) ?? "";
  const { errors } = form.formState;

  React.useEffect(() => {
    if (!home) return;
    if (remaining <= 0) {
      router.replace(home);
      return;
    }
    const id = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [home, remaining, router]);

  if (done) {
    return (
      <AuthCard icon={CircleCheckBig} tone="success" title="Password updated" description="Your new password is saved and you're signed in. Use it the next time you sign in.">
        <div role="status" className="grid gap-3">
          <Button size="lg" className="w-full" onClick={() => router.replace(home)}>
            Continue to dashboard <ArrowRight aria-hidden />
          </Button>
          <p className="text-center text-xs text-white/55">Taking you there in {Math.max(remaining, 0)}s…</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={ShieldCheck} title="Set a new password" description="You're signed in through your reset link. Choose a strong password you haven't used before.">
      <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
        <Field id="password" label="New password" error={errors.password?.message}>
          {(a) => <PasswordInput autoComplete="new-password" autoFocus placeholder="Create a strong password" {...a} {...form.register("password")} />}
        </Field>
        <PasswordStrength password={password} />
        <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
          {(a) => <PasswordInput autoComplete="new-password" placeholder="Re-enter the new password" {...a} {...form.register("confirmPassword")} />}
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" pending={pending}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
