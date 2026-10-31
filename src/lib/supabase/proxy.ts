import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/auth", "/setup", "/icon", "/apple-icon", "/opengraph-image"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

// Pages live under app/[lang]; these routes don't (route handlers).
const NOT_LOCALIZED = ["/api", "/auth/confirm", "/dashboard"];

/**
 * Serves the page in the visitor's interface language without changing the URL:
 * /teacher → /bn/teacher (or /en/teacher), chosen from the `lang` cookie. An explicit
 * /bn/... or /en/... path is served as is.
 */
function localize(request: NextRequest): { pathname: string; rewrite: URL | null } {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return { pathname: pathname.slice(first.length + 1) || "/", rewrite: null };
  if (NOT_LOCALIZED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return { pathname, rewrite: null };
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const url = request.nextUrl.clone();
  url.pathname = `/${isLocale(cookie) ? cookie : DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return { pathname, rewrite: url };
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated visitors away from protected routes. Role checks happen in
 * the data access layer and in the database (RLS), not here.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, rewrite } = localize(request);
  const pass = () => (rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request }));

  let env;
  try {
    env = getPublicEnv();
  } catch {
    // Misconfigured deployment: show the setup page instead of crashing.
    if (pathname === "/setup") return pass();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = pass();
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = pass();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
