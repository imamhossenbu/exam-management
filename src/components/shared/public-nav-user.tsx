import Link from "next/link";
import { getCurrentProfile, homeFor } from "@/lib/auth/dal";
import { Button } from "@/components/ui/button";

function initials(name: string, email: string | null) {
  const source = name.trim() || email || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export async function PublicNavUser() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="flex items-center gap-1.5">
        <Button asChild variant="ghost" size="sm" className="h-8.5 px-3 text-xs">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex h-8.5 px-3.5 text-xs">
          <Link href="/signup">Get started</Link>
        </Button>
      </div>
    );
  }

  const home = homeFor(profile.role);
  const firstName = profile.full_name?.split(" ")[0] || "Account";

  return (
    <div className="flex items-center gap-2">
      <Button asChild size="sm" variant="default" className="h-8.5 px-3 text-xs font-semibold shadow-sm">
        <Link href={home}>Dashboard</Link>
      </Button>
      <Link
        href={`/${profile.role}/settings`}
        className="flex items-center gap-2 rounded-full border border-border/70 bg-surface/80 py-1 pl-1 pr-2.5 shadow-sm transition-all hover:bg-surface hover:border-border hover:shadow-card focus-ring"
        aria-label="Account settings"
      >
        <div className="relative shrink-0">
          {profile.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatar_url}
              alt={profile.full_name || "Profile avatar"}
              className="size-7 rounded-full object-cover ring-1 ring-border shadow-sm"
            />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-sm">
              {initials(profile.full_name, profile.email)}
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-1.5 ring-background" aria-hidden />
        </div>
        <span className="hidden sm:inline-block max-w-[100px] truncate text-xs font-medium text-foreground">
          {firstName}
        </span>
      </Link>
    </div>
  );
}

export function PublicNavUserSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-8.5 w-20 animate-pulse rounded-lg bg-muted" />
      <div className="size-7 rounded-full animate-pulse bg-muted" />
    </div>
  );
}
