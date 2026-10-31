"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import { setLocaleAction } from "@/features/settings/locale-action";
import { LOCALE_LABEL, LOCALES, type Locale } from "@/lib/i18n/config";
import { setClientLocale, useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

/** বাংলা / English toggle. Switches instantly on this page, then saves the choice. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const [pending, startTransition] = React.useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    setClientLocale(next);
    startTransition(async () => {
      await setLocaleAction(next);
    });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Languages className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div role="radiogroup" aria-label={t("Language")} className="inline-flex rounded-full border bg-muted/50 p-0.5" aria-busy={pending}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={locale === l}
            lang={l}
            onClick={() => choose(l)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-ring",
              locale === l ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
