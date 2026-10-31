import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shared/app-shell";
import { UserMenu, UserMenuSkeleton } from "@/components/shared/user-menu";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StudentLayout({ children }: LayoutProps<"/[lang]/student">) {
  return (
    <AppShell
      kind="student"
      userSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu kind="student" />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
