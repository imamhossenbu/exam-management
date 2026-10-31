"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { AuthCard } from "@/components/shared/auth-card";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { signUpAction } from "@/features/auth/actions";
import { signUpSchema, type SignUpInput } from "@/lib/validations/auth";
import { PasswordStrength } from "./password-strength";
import { OtpVerifyCard } from "./otp-verify-card";
import { T } from "@/lib/i18n/client";

/** The whole sign-up card: the form, then a 6-digit OTP verification screen once the email is sent. */
export function SignUpForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });
  const { run, pending } = useServerAction(signUpAction, { successToast: false, onSuccess: () => setSentTo(form.getValues("email").trim().toLowerCase()) });
  const password = useWatch({ control: form.control, name: "password" }) ?? "";
  const { errors } = form.formState;

  if (sentTo) {
    return <OtpVerifyCard email={sentTo} onBack={() => setSentTo(null)} />;
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
            <T>Sign in</T>
          </Link>
        </>
      }
    >
      <form noValidate className="grid gap-2.5 sm:gap-3" onSubmit={form.handleSubmit(async (v) => applyFieldErrors(form.setError, await run(v)))}>
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
        <Button type="submit" size="md" className="mt-0.5 w-full h-9 sm:h-9.5 text-xs sm:text-sm font-semibold shadow-sm" pending={pending}>
          <T>Create student account</T>
        </Button>
      </form>
    </AuthCard>
  );
}
