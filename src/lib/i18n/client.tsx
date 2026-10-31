"use client";

import * as React from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { translate, type Translate, type TranslateVars } from "./translate";
import { formatters, type Formatters } from "@/lib/utils/datetime";

/**
 * The interface language comes from the route (`app/[lang]`), so the server and the browser
 * always render the same language: no flash and no hydration mismatch.
 */
const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

export function useT(): Translate {
  const locale = useLocale();
  return React.useCallback((text: string, vars?: TranslateVars) => translate(locale, text, vars), [locale]);
}

/** Translated text for places that can't call a hook (static server markup). */
export function T({ children, vars }: { children: string; vars?: TranslateVars }) {
  const t = useT();
  return <>{t(children, vars)}</>;
}

/** Translation for event handlers and toasts. Reads the page's language (<html lang>). */
export function tNow(text: string, vars?: TranslateVars): string {
  const lang = typeof document === "undefined" ? null : document.documentElement.lang;
  return translate(isLocale(lang) ? lang : DEFAULT_LOCALE, text, vars);
}

/**
 * Saves the choice on this device. The page is then reloaded so every part (including
 * prefetched pages) comes back in the new language.
 */
export function setClientLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Date/time/duration formatters in the page's language. */
export function useFormatters(): Formatters {
  const locale = useLocale();
  return React.useMemo(() => formatters(locale), [locale]);
}

/** For places that can't call a hook (e.g. table cell renderers). */
export function DateTimeText({ iso, timeZone, withZone }: { iso: string | null | undefined; timeZone: string; withZone?: boolean }) {
  return <>{useFormatters().dateTime(iso, timeZone, { withZone })}</>;
}
export function DateText({ iso, timeZone }: { iso: string | null | undefined; timeZone: string }) {
  return <>{useFormatters().date(iso, timeZone)}</>;
}
export function MinutesText({ minutes }: { minutes: number }) {
  return <>{useFormatters().minutes(minutes)}</>;
}
