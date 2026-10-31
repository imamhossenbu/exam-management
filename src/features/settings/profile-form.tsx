"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, GraduationCap, Phone, Trash2, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput, Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { updateProfileAction } from "@/features/auth/actions";
import { profileSchema, type ProfileInput } from "@/lib/validations/auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { T, tNow } from "@/lib/i18n/client";

function timezoneOptions(current: string) {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  return zones.includes(current) ? zones : [current, ...zones];
}

function getInitials(name: string, email: string | null) {
  const source = name.trim() || email || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

type ProfileFormProps = {
  fullName: string;
  timezone: string;
  email: string | null;
  studentClass?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role?: "teacher" | "student";
};

export function ProfileForm({
  fullName,
  timezone,
  email,
  studentClass = "",
  phone = "",
  avatarUrl = "",
  role = "student",
}: ProfileFormProps) {
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName,
      timezone,
      studentClass: studentClass ?? "",
      phone: phone ?? "",
      avatarUrl: avatarUrl ?? "",
    },
  });

  const router = useRouter();
  const { run, pending } = useServerAction(updateProfileAction);
  const zones = React.useMemo(() => timezoneOptions(timezone), [timezone]);
  const { errors, isDirty } = form.formState;
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const currentAvatar = useWatch({ control: form.control, name: "avatarUrl" });
  const currentName = useWatch({ control: form.control, name: "fullName" });

  function useBrowserZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    form.setValue("timezone", zone, { shouldDirty: true });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(tNow("Please upload an image file (PNG, JPG, or WebP)."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(tNow("Image file is too large. Choose an image under 5MB."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Optimize and crop to square avatar canvas
        const size = 300;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Cover crop math
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/webp", 0.88);

        form.setValue("avatarUrl", dataUrl, { shouldDirty: true });
        toast.success(tNow("Profile photo updated. Click 'Save changes' to save."));
      };
      img.onerror = () => toast.error(tNow("This image couldn't be opened. Choose a JPG, PNG or WebP photo."));
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRemoveAvatar() {
    form.setValue("avatarUrl", "", { shouldDirty: true });
    toast.info(tNow("Profile photo removed. Click 'Save changes' to save."));
  }

  return (
    <form
      noValidate
      className="grid max-w-xl gap-6"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await run(values);
        applyFieldErrors(form.setError, result);
        if (result?.ok) {
          const newAvatar = result.data?.avatarUrl ?? values.avatarUrl;
          form.reset({ ...values, avatarUrl: newAvatar });
          router.refresh();
        }
      })}
    >
      {/* Avatar upload section */}
      <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl border border-border bg-card/50">
        <div className="relative group shrink-0">
          {currentAvatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentAvatar}
              alt="Profile avatar"
              className="size-20 rounded-full object-cover ring-4 ring-primary/20 shadow-md"
            />
          ) : (
            <div className="size-20 rounded-full bg-brand-gradient flex items-center justify-center text-xl font-bold text-white ring-4 ring-primary/20 shadow-md">
              {getInitials(currentName || fullName, email)}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 size-7 rounded-full bg-primary text-primary-foreground shadow flex items-center justify-center hover:opacity-90 transition-opacity"
            title="Upload photo"
            aria-label="Upload photo"
          >
            <Camera className="size-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1.5">
          <h4 className="font-medium text-foreground text-sm"><T>Profile photo</T></h4>
          <p className="text-xs text-muted-foreground">
            <T>Upload a clear square picture (JPEG, PNG, or WebP up to 5MB).</T>
          </p>

          <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Upload className="size-3.5" aria-hidden /> <T>Change photo</T>
            </Button>

            {currentAvatar ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveAvatar}
                className="gap-1.5 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" aria-hidden /> <T>Remove</T>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Field id="email" label="Email" description="Your sign-in email can't be changed here.">
        {(a) => <Input value={email ?? ""} readOnly disabled {...a} />}
      </Field>

      <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
        {(a) => (
          <IconInput
            icon={User}
            autoComplete="name"
            placeholder="Your full name"
            {...a}
            {...form.register("fullName")}
          />
        )}
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          id="studentClass"
          label={role === "teacher" ? "Designation / Subject" : "Class / Batch"}
          description={role === "teacher" ? "e.g. Senior Lecturer, Physics" : "e.g. Class 10, HSC 2026, CSE 9th"}
          error={errors.studentClass?.message}
        >
          {(a) => (
            <IconInput
              icon={GraduationCap}
              placeholder={role === "teacher" ? "e.g. Physics Department" : "e.g. Class 10 - Section A"}
              {...a}
              {...form.register("studentClass")}
            />
          )}
        </Field>

        <Field
          id="phone"
          label="Phone number"
          description="Contact phone for notifications"
          error={errors.phone?.message}
        >
          {(a) => (
            <IconInput
              icon={Phone}
              type="tel"
              autoComplete="tel"
              placeholder="e.g. +880 1712-345678"
              {...a}
              {...form.register("phone")}
            />
          )}
        </Field>
      </div>

      <Field
        id="timezone"
        label="Timezone"
        description={
          <>
            All dates and exam times are shown in this timezone.{" "}
            <button type="button" className="text-primary hover:underline font-medium" onClick={useBrowserZone}>
              <T>Use my device&apos;s timezone</T>
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
          <T>Save changes</T>
        </Button>
      </div>
    </form>
  );
}
