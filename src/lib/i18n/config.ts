/** Interface languages. Bangla is the default; English stays available. */
export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bn";
export const LOCALE_COOKIE = "lang";
export const LOCALE_LABEL: Record<Locale, string> = { bn: "বাংলা", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
