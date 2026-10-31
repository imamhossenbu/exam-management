import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { trChildren } from "@/lib/i18n/tr";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-surface/60 px-6 py-14 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-xl" aria-hidden />
        <div className="grid size-12 place-items-center rounded-2xl border bg-surface text-primary shadow-elevated">
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <h3 className="section-title">{trChildren(title)}</h3>
      {description ? <p className="text-subtle mt-1.5 max-w-md">{trChildren(description)}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
