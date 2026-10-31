import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./input";
import { trChildren } from "@/lib/i18n/tr";

type FieldProps = {
  id: string;
  label: React.ReactNode;
  error?: string;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
};

/** Accessible form field: wires label, description and error to the control. */
export function Field({ id, label, error, description, required, className, children }: FieldProps) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy || undefined })}
      {description ? (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {trChildren(description)}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {trChildren(error)}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
      {trChildren(message)}
    </div>
  );
}
