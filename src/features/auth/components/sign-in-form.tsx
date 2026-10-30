"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Mail } from "lucide-react";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { signInAction } from "@/features/auth/actions";
import { signInSchema, type SignInInput } from "@/lib/validations/auth";

export function SignInForm({ next }: { next?: string }) {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "", next } });
  const { run, pending } = useServerAction(signInAction);
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="grid gap-2.5 sm:gap-3"
      onSubmit={form.handleSubmit(async (values) => applyFieldErrors(form.setError, await run(values)))}
    >
      <Field id="email" label="Email" error={errors.email?.message}>
        {(a) => <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...a} {...form.register("email")} />}
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        {(a) => <PasswordInput autoComplete="current-password" placeholder="Enter your password" {...a} {...form.register("password")} />}
      </Field>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="md" className="mt-0.5 w-full h-9 sm:h-9.5 text-xs sm:text-sm font-semibold shadow-sm" pending={pending}>
        Sign in
      </Button>
    </form>
  );
}
