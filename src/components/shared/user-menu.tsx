import Link from "next/link";
import { ChevronDown, Settings } from "lucide-react";
import { getCurrentProfile, homeFor } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
import { SignOutItem } from "./sign-out-item";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NavKind } from "./nav-config";
import { trChildren } from "@/lib/i18n/tr";
import { LanguageSwitcher } from "./language-switcher";
import { getT } from "@/lib/i18n/server";

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

  const t = await getT();
  const roleLabel = profile.role === "teacher" ? t("Teacher") : profile.student_class ? t("Class {name}", { name: profile.student_class }) : t("Student");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full border border-border/70 bg-surface/80 py-1 pl-1 pr-2.5 shadow-sm transition-all hover:bg-surface hover:border-border hover:shadow-card focus-ring"
        aria-label="Account menu"
      >
        <div className="relative shrink-0">
          {profile.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatar_url}
              alt={profile.full_name || "Profile avatar"}
              className="size-7.5 sm:size-8 rounded-full object-cover ring-1.5 ring-background shadow-sm"
            />
          ) : (
            <span className="grid size-7.5 sm:size-8 place-items-center rounded-full bg-brand-gradient text-xs font-semibold text-white ring-1.5 ring-background shadow-sm">
              {initials(profile.full_name, profile.email)}
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-1.5 ring-background" aria-hidden />
        </div>
        <div className="hidden sm:flex flex-col text-left">
          <span className="max-w-[120px] truncate text-xs font-semibold leading-tight text-foreground">
            {profile.full_name || trChildren("Account")}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground leading-none">
            {trChildren(roleLabel)}
          </span>
        </div>
        <ChevronDown className="hidden sm:inline-block size-3 text-muted-foreground/80 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-1.5" align="end">
        <DropdownMenuLabel className="p-2">
          <div className="flex items-center gap-3">
            {profile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={profile.avatar_url}
                alt={profile.full_name || "Profile avatar"}
                className="size-10 rounded-full object-cover ring-1 ring-border shadow-sm"
              />
            ) : (
              <span className="grid size-10 place-items-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-sm">
                {initials(profile.full_name, profile.email)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">
                {profile.full_name || trChildren("Unnamed user")}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {profile.email}
              </span>
              <span className="mt-1 inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-soft-foreground">
                {trChildren(roleLabel)}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${kind}/settings`} className="flex items-center gap-2 text-xs">
            <Settings className="size-3.5" aria-hidden /> {trChildren("Settings & Profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <LanguageSwitcher />
        </div>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/40 py-1 pl-1 pr-2.5">
      <Skeleton className="size-7.5 sm:size-8 rounded-full" />
      <div className="hidden sm:flex flex-col gap-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-2 w-10" />
      </div>
    </div>
  );
}
