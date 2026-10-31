import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { trChildren } from "@/lib/i18n/tr";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-4 pb-2.5 sm:px-5 sm:pt-4.5 sm:pb-3", className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 className={cn("section-title", className)} {...props}>
      {trChildren(children)}
    </h2>
  );
}

export function CardDescription({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-subtle", className)} {...props}>
      {trChildren(children)}
    </p>
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4 sm:px-5 sm:pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-end gap-2 border-t bg-muted/40 px-4 py-2.5 rounded-b-[inherit] sm:px-5 sm:py-3", className)} {...props} />;
}
