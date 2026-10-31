import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { trChildren } from "@/lib/i18n/tr";

const TONES = {
  brand: "bg-primary/20 text-[oklch(0.85_0.1_277)] ring-primary/40",
  success: "bg-success/15 text-success ring-success/35",
  warning: "bg-warning/15 text-warning ring-warning/35",
} as const;

/** Icon chip used at the top of auth screens. */
export function AuthIcon({ icon: Icon, tone = "brand" }: { icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <span className={cn("relative mx-auto mb-2.5 sm:mb-3 grid size-10 sm:size-10.5 place-items-center rounded-xl ring-1", TONES[tone])}>
      <span className="absolute inset-0 -z-10 rounded-xl bg-current opacity-20 blur-lg" aria-hidden />
      <Icon className="size-4.5 sm:size-5" aria-hidden />
    </span>
  );
}

/** Content of the glass auth card (the card itself is drawn by the auth layout). */
export function AuthCard({
  title,
  description,
  icon,
  tone,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-3 sm:mb-3.5 text-center">
        {icon ? <AuthIcon icon={icon} tone={tone} /> : null}
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">{trChildren(title)}</h1>
        {description ? <p className="mt-1 text-xs text-white/70 leading-relaxed">{trChildren(description)}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-3.5 border-t border-white/10 pt-3 text-center text-xs text-white/60 sm:mt-4 sm:pt-3.5">{footer}</div> : null}
    </div>
  );
}

/** Numbered "what to do next" list shown after an email is sent. */
export function AuthSteps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="grid gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4 text-left text-xs sm:text-sm text-white/80">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2.5 sm:gap-3">
          <span className="grid size-5 sm:size-6 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] sm:text-xs font-semibold text-white">{i + 1}</span>
          <span className="pt-0.5 leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Highlighted email address chip. */
export function EmailChip({ email }: { email: string }) {
  return (
    <span className="mt-2 inline-flex max-w-full items-center rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-xs sm:text-sm font-medium break-all text-white">
      {email}
    </span>
  );
}
