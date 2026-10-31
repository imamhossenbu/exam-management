import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { translator, type Translate } from "./translate";

/**
 * Language for Server Actions and Route Handlers (they can't read root params): the cookie the
 * proxy also uses. Server Components should use getRouteT() from "./route".
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
