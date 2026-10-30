import Link from "next/link";
import { Settings } from "lucide-react";
import { getCurrentProfile, homeFor } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
import { SignOutItem } from "./sign-out-item";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NavKind } from "./nav-config";

function initials(name: string, email: string | null) {
  const source = name.trim() || email || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Reads the session — always render inside <Suspense>. Also enforces the area's role. */
export async function UserMenu({ kind }: { kind: NavKind }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== kind) redirect(homeFor(profile.role));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus-ring" aria-label="Account menu">
        {profile.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={profile.avatar_url}
            alt={profile.full_name || "Profile avatar"}
            className="size-9 rounded-full object-cover ring-2 ring-background shadow-card"
          />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-brand-gradient text-sm font-semibold text-white ring-2 ring-background shadow-card">
            {initials(profile.full_name, profile.email)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{profile.full_name || "Unnamed user"}</span>
          <span className="block truncate">{profile.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${kind}/settings`}>
            <Settings aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenuSkeleton() {
  return <Skeleton className="size-9 rounded-full" />;
}
