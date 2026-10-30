import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { NavList, SidebarNav } from "./sidebar-nav";
import type { NavKind } from "./nav-config";

/**
 * Static dashboard chrome. The user menu (which reads the session) is passed
 * in already wrapped in Suspense so the shell prerenders instantly.
 */
export function AppShell({ kind, userSlot, children }: { kind: NavKind; userSlot: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-elevated">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex z-30">
        <div className="flex h-14 items-center px-5 border-b border-border/40">
          <Link href={kind === "teacher" ? "/teacher" : "/student"} className="focus-ring rounded-lg">
            <Brand />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <Suspense fallback={<NavList kind={kind} />}>
            <SidebarNav kind={kind} />
          </Suspense>
        </div>
        <div className="m-3 rounded-xl border bg-surface p-3 shadow-card">
          <p className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            {kind === "teacher" ? "Teacher workspace" : "Student workspace"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Your data is private and protected by row-level security.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-6 shadow-2xs">
          <MobileNav kind={kind} />
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {userSlot}
          </div>
        </header>
        <main id="main" className="page-container flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
