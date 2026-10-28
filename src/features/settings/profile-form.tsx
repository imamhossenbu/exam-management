"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { updateProfileAction } from "@/features/auth/actions";
import { profileSchema, type ProfileInput } from "@/lib/validations/auth";

function timezoneOptions(current: string) {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  return zones.includes(current) ? zones : [current, ...zones];
}

export function ProfileForm({ fullName, timezone, email }: { fullName: string; timezone: string; email: string | null }) {
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { fullName, timezone } });
  const { run, pending } = useServerAction(updateProfileAction);
  const zones = React.useMemo(() => timezoneOptions(timezone), [timezone]);
  const { errors, isDirty } = form.formState;

  function useBrowserZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    form.setValue("timezone", zone, { shouldDirty: true });
  }

  return (
    <form
      noValidate
      className="grid max-w-lg gap-5"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await run(values);
        applyFieldErrors(form.setError, result);
        if (result?.ok) form.reset(values);
      })}
    >
      <Field id="email" label="Email" description="Your sign-in email can't be changed here.">
        {(a) => <Input value={email ?? ""} readOnly disabled {...a} />}
      </Field>
      <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
        {(a) => <Input autoComplete="name" placeholder="Your full name" {...a} {...form.register("fullName")} />}
      </Field>
      <Field
        id="timezone"
        label="Timezone"
        description={
          <>
            All dates and exam times are shown in this timezone.{" "}
            <button type="button" className="text-primary hover:underline" onClick={useBrowserZone}>
              Use my device&apos;s timezone
            </button>
          </>
        }
        error={errors.timezone?.message}
      >
        {(a) => (
          <NativeSelect {...a} {...form.register("timezone")}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div>
        <Button type="submit" pending={pending} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
