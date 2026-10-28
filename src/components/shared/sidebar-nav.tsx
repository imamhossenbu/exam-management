"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV, type NavKind } from "./nav-config";

export function SidebarNav({ kind, onNavigate }: { kind: NavKind; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList kind={kind} activePath={pathname} onNavigate={onNavigate} />;
}

/** Static variant used as the Suspense fallback (no active highlighting). */
export function NavList({ kind, activePath, onNavigate }: { kind: NavKind; activePath?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3">
      {NAV[kind].map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[0.7rem] font-semibold tracking-wider text-muted-foreground/70 uppercase">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = activePath
                ? item.exact
                  ? activePath === item.href
                  : activePath === item.href || activePath.startsWith(`${item.href}/`)
                : false;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring",
                      active && "bg-sidebar-active text-sidebar-active-foreground shadow-card ring-1 ring-border hover:bg-sidebar-active",
                    )}
                  >
                    {active ? <span className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-gradient" aria-hidden /> : null}
                    <item.icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
