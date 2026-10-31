"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { trChildren } from "@/lib/i18n/tr";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/translate";

/** Translates user-visible text attributes when they are plain strings. */
function trAttrs<P extends { placeholder?: unknown; "aria-label"?: unknown; title?: unknown }>(props: P, t: Translate): P {
  const out = { ...props };
  for (const key of ["placeholder", "aria-label", "title"] as const) if (typeof out[key] === "string") (out as Record<string, unknown>)[key] = t(out[key] as string);
  return out;
}

export const controlClass =
  "w-full rounded-lg border border-input bg-surface px-3 text-sm shadow-[0_1px_2px_oklch(0.2_0.02_286/0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/80 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  const t = useT();
  return <input type={type} className={cn(controlClass, "h-10 py-1", className)} {...trAttrs(props, t)} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const t = useT();
  return <textarea className={cn(controlClass, "min-h-24 py-2 leading-relaxed", className)} {...trAttrs(props, t)} />;
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  const t = useT();
  // <option> <T>only accepts plain text, so translate it here rather than with</T> <T>.
  const options = React.Children.map(children, (child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === "option" && typeof child.props.children === "string"
      ? React.cloneElement(child, undefined, t(child.props.children))
      : child,
  );
  return (
    <select className={cn(controlClass, "h-10 cursor-pointer py-1 pr-8", className)} {...trAttrs(props, t)}>
      {options}
    </select>
  );
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 shrink-0 rounded border-input accent-primary focus-ring disabled:opacity-60", className)}
      {...props}
    />
  );
}

export function Label({ className, children, ...props }: React.ComponentProps<"label">) {
  return (
    <label className={cn("text-sm font-medium leading-none", className)} {...props}>
      {trChildren(children)}
    </label>
  );
}

/** Input with a leading icon (e.g. Mail, Search). */
export function IconInput({ icon: Icon, className, ...props }: React.ComponentProps<"input"> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}
