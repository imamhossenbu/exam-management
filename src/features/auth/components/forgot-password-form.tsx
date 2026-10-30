"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { AuthCard, AuthSteps, EmailChip } from "@/components/shared/auth-card";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { ResendButton } from "./resend-button";

const backToSignIn = (
  <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-white/80 hover:text-white">
    <ArrowLeft className="size-4" aria-hidden /> Back to sign in
  </Link>
);

/** The whole forgot-password card: the email form, then a "check your inbox" screen. */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { run, pending } = useServerAction(requestPasswordResetAction, {
    successToast: false,
    onSuccess: () => setSentTo(form.getValues("email").trim().toLowerCase()),
  });
  const resend = useServerAction(requestPasswordResetAction);

  if (sentTo) {
    return (
      <AuthCard icon={MailCheck} tone="success" title="Check your email" description="If an account exists for" footer={backToSignIn}>
        <div role="status" className="-mt-4 mb-6 text-center">
          <EmailChip email={sentTo} />
          <p className="mt-3 text-sm text-white/70">you&apos;ll receive a password reset link shortly.</p>
        </div>
        <AuthSteps
          steps={[
            <>
              Open the email <span className="font-medium text-white">Reset your ExamDesk password</span>.
            </>,
            <>
              Click <span className="font-medium text-white">Reset password</span> within 1 hour.
            </>,
            <>Choose a new password — you&apos;ll be signed in right away.</>,
          ]}
        />
        <div className="mt-5 grid gap-3">
          <ResendButton pending={resend.pending} onResend={async () => Boolean((await resend.run({ email: sentTo }))?.ok)} />
          <button type="button" onClick={() => setSentTo(null)} className="text-center text-xs font-medium text-white/60 hover:text-white">
            Wrong email? Try a different one
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={KeyRound} title="Forgot your password?" description="No worries. Enter the email you signed up with and we'll send you a secure reset link." footer={backToSignIn}>
      <form noValidate className="grid gap-3" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
        <Field id="email" label="Email" error={form.formState.errors.email?.message}>
          {(a) => <IconInput icon={Mail} type="email" autoComplete="email" autoFocus placeholder="you@example.com" {...a} {...form.register("email")} />}
        </Field>
        <Button type="submit" size="md" className="mt-0.5 w-full h-9.5 sm:h-10 text-sm font-semibold shadow-sm" pending={pending}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
