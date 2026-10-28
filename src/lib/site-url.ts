import "server-only";
import { headers } from "next/headers";
import { getPublicEnv } from "@/lib/env";

/** Absolute origin for auth email links. Prefers the configured site URL. */
export async function getSiteUrl(): Promise<string> {
  const configured = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
