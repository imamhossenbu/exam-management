import { bn } from "./bn";
import type { Locale } from "./config";

export type TranslateVars = Record<string, string | number | null | undefined>;
export type Translate = (text: string, vars?: TranslateVars) => string;

const DICTIONARIES: Record<Locale, Record<string, string>> = { bn, en: {} };

/**
 * Gettext-style lookup: the English text is the key. Missing translations fall back to the
 * English text, so nothing ever renders blank. `{name}` placeholders are filled from `vars`.
 */
export function translate(locale: Locale, text: string, vars?: TranslateVars): string {
  const template = DICTIONARIES[locale][text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (vars[key] === undefined || vars[key] === null ? match : String(vars[key])));
}

export function translator(locale: Locale): Translate {
  return (text, vars) => translate(locale, text, vars);
}
