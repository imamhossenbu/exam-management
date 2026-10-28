import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Upper and lower case letters", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A symbol (e.g. ! @ #)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const LEVELS = [
  { label: "Too short", bar: "bg-danger" },
  { label: "Weak", bar: "bg-danger" },
  { label: "Fair", bar: "bg-warning" },
  { label: "Good", bar: "bg-[oklch(0.78_0.14_130)]" },
  { label: "Strong", bar: "bg-success" },
];

/** Live password checklist. Only the length rule is required; the rest raise the strength score. */
export function PasswordStrength({ password }: { password: string }) {
  const passed = RULES.map((r) => r.test(password));
  const score = passed[0] ? passed.filter(Boolean).length : 0;
  const level = LEVELS[score];

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/60">Password strength</span>
        <span className="font-medium text-white">{password ? level.label : "—"}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 rounded-full bg-white/10 transition-colors", password && score >= i && level.bar)} />
        ))}
      </div>
      <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
        {RULES.map((rule, i) => (
          <li key={rule.label} className={cn("flex items-center gap-2 transition-colors", passed[i] ? "text-white" : "text-white/50")}>
            <span className={cn("grid size-4 place-items-center rounded-full", passed[i] ? "bg-success text-black" : "bg-white/10")}>
              {passed[i] ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
            </span>
            {rule.label}
            <span className="sr-only">{passed[i] ? "(met)" : "(not met)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
