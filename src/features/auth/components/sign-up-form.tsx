"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Mail, MailCheck, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { AuthCard, AuthSteps, EmailChip } from "@/components/shared/auth-card";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { resendConfirmationAction, signUpAction } from "@/features/auth/actions";
import { signUpSchema, type SignUpInput } from "@/lib/validations/auth";
import { PasswordStrength } from "./password-strength";
import { ResendButton } from "./resend-button";

/** The whole sign-up card: the form, then a "check your inbox" screen once the email is sent. */
export function SignUpForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });
  const { run, pending } = useServerAction(signUpAction, { successToast: false, onSuccess: () => setSentTo(form.getValues("email").trim().toLowerCase()) });
  const resend = useServerAction(resendConfirmationAction);
  const password = useWatch({ control: form.control, name: "password" }) ?? "";
  const { errors } = form.formState;

  if (sentTo) {
    return (
      <AuthCard
        icon={MailCheck}
        tone="success"
        title="Verify your email"
        description="We sent a confirmation link to"
        footer={
          <button type="button" onClick={() => setSentTo(null)} className="inline-flex items-center gap-1.5 font-medium text-white/80 hover:text-white">
            <ArrowLeft className="size-4" aria-hidden /> Use a different email
          </button>
        }
      >
        <div role="status" className="-mt-4 mb-6 text-center">
          <EmailChip email={sentTo} />
        </div>
        <AuthSteps
          steps={[
            <>
              Open the email from <span className="font-medium text-white">ExamDesk</span>.
            </>,
            <>
              Click <span className="font-medium text-white">Confirm my email</span> — you&apos;ll be signed in automatically.
            </>,
            <>Join your course with the invitation code from your teacher.</>,
          ]}
        />
        <div className="mt-5 grid gap-3">
          <ResendButton pending={resend.pending} onResend={async () => Boolean((await resend.run({ email: sentTo }))?.ok)} />
          <p className="text-center text-xs text-white/55">Didn&apos;t get it? Check your spam or promotions folder. The link expires in 1 hour.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={UserPlus}
      title="Create your student account"
      description="After signing up, join your course with the invitation code from your teacher."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
        <Field id="fullName" label="Full name" error={errors.fullName?.message}>
          {(a) => <IconInput icon={User} autoComplete="name" placeholder="e.g. Ayesha Rahman" {...a} {...form.register("fullName")} />}
        </Field>
        <Field id="email" label="Email" error={errors.email?.message}>
          {(a) => <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...a} {...form.register("email")} />}
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          {(a) => <PasswordInput autoComplete="new-password" placeholder="Create a strong password" {...a} {...form.register("password")} />}
        </Field>
        {password ? <PasswordStrength password={password} /> : null}
        <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
          {(a) => <PasswordInput autoComplete="new-password" placeholder="Re-enter your password" {...a} {...form.register("confirmPassword")} />}
        </Field>
        <Button type="submit" size="lg" className="mt-1 w-full" pending={pending}>
          Create student account
        </Button>
      </form>
    </AuthCard>
  );
}
