import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground ring-border",
      primary: "bg-primary-soft text-primary-soft-foreground ring-primary/15",
      success: "bg-success-soft text-success-soft-foreground ring-success/20",
      warning: "bg-warning-soft text-warning-soft-foreground ring-warning/25",
      danger: "bg-danger-soft text-danger-soft-foreground ring-danger/20",
      info: "bg-info-soft text-info-soft-foreground ring-info-soft-foreground/15",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
