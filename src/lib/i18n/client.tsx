"use client";

import * as React from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { translate, type Translate, type TranslateVars } from "./translate";

const EVENT = "examdesk:locale";

function readCookie(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("focus", callback);
  };
}

/** Current interface language. Prerendered HTML uses the default; the browser switches on hydration. */
export function useLocale(): Locale {
  return React.useSyncExternalStore(subscribe, readCookie, () => DEFAULT_LOCALE);
}

export function useT(): Translate {
  const locale = useLocale();
  return React.useCallback((text: string, vars?: TranslateVars) => translate(locale, text, vars), [locale]);
}

/** Translation for event handlers and toasts (reads the current choice at call time). */
export function tNow(text: string, vars?: TranslateVars): string {
  return translate(typeof document === "undefined" ? DEFAULT_LOCALE : readCookie(), text, vars);
}

/** Translated text for places that can't call a hook (static server markup). */
export function T({ children, vars }: { children: string; vars?: TranslateVars }) {
  const t = useT();
  return <>{t(children, vars)}</>;
}

/** Stores the choice on this device and updates every mounted translation at once. */
export function setClientLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps <html lang> in step with the chosen language (screen readers, fonts, spell-check). */
export function HtmlLang() {
  const locale = useLocale();
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
