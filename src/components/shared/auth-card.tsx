import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONES = {
  brand: "bg-primary/20 text-[oklch(0.85_0.1_277)] ring-primary/40",
  success: "bg-success/15 text-success ring-success/35",
  warning: "bg-warning/15 text-warning ring-warning/35",
} as const;

/** Icon chip used at the top of auth screens. */
export function AuthIcon({ icon: Icon, tone = "brand" }: { icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <span className={cn("relative mx-auto mb-5 grid size-14 place-items-center rounded-2xl ring-1", TONES[tone])}>
      <span className="absolute inset-0 -z-10 rounded-2xl bg-current opacity-20 blur-xl" aria-hidden />
      <Icon className="size-6" aria-hidden />
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
      <div className="mb-7 text-center">
        {icon ? <AuthIcon icon={icon} tone={tone} /> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-relaxed text-white/70">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-7 border-t border-white/10 pt-6 text-center text-sm text-white/60">{footer}</div> : null}
    </div>
  );
}

/** Numbered "what to do next" list shown after an email is sent. */
export function AuthSteps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm text-white/80">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">{i + 1}</span>
          <span className="pt-0.5 leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Highlighted email address chip. */
export function EmailChip({ email }: { email: string }) {
  return (
    <span className="mt-3 inline-flex max-w-full items-center rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-sm font-medium break-all text-white">
      {email}
    </span>
  );
}
