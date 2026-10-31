"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { trChildren } from "@/lib/i18n/tr";
import { useT } from "@/lib/i18n/client";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-150 focus-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.2_0.1_277/0.25),inset_0_1px_0_oklch(1_0_0/0.15)] hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        outline: "border border-border bg-surface shadow-card hover:bg-muted hover:border-input",
        ghost: "text-foreground/80 hover:bg-muted hover:text-foreground",
        destructive: "bg-danger text-danger-foreground shadow-[0_1px_2px_oklch(0.3_0.15_25/0.3)] hover:bg-danger/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-[0.95rem]",
        icon: "size-9",
        "icon-xs": "size-7",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner and disables the button (prevents duplicate submissions). */
    pending?: boolean;
  };

export function Button({ className, variant, size, asChild, pending, disabled, children, ...rest }: ButtonProps) {
  const t = useT();
  const props = { ...rest };
  if (typeof props["aria-label"] === "string") props["aria-label"] = t(props["aria-label"]);
  if (typeof props.title === "string") props.title = t(props.title);
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {React.isValidElement<{ children?: React.ReactNode }>(children)
          ? React.cloneElement(children, undefined, trChildren(children.props.children))
          : children}
      </Slot.Root>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {trChildren(children)}
    </button>
  );
}
