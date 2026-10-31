"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/** Saves the interface language on this device (cookie) and, when signed in, on the profile. */
export async function setLocaleAction(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return fail("Choose a valid language.");
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (uid) {
    const { error } = await supabase.from("profiles").update({ locale }).eq("id", uid);
    if (error) console.error("[action:setLocale]", error.code, error.message);
  }
  return ok(undefined);
}
