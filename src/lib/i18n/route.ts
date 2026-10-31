import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { translator, type Translate } from "./translate";
import { formatters, type Formatters } from "@/lib/utils/datetime";

/** The interface language of the current route (Server Components only; works in static shells). */
export async function getRouteLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getRouteT(): Promise<Translate> {
  return translator(await getRouteLocale());
}

/** Date/time/duration formatters in the route's language (Server Components). */
export async function getFormatters(): Promise<Formatters> {
  return formatters(await getRouteLocale());
}
