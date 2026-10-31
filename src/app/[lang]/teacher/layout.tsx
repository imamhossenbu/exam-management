import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shared/app-shell";
import { UserMenu, UserMenuSkeleton } from "@/components/shared/user-menu";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function TeacherLayout({ children }: LayoutProps<"/[lang]/teacher">) {
  return (
    <AppShell
      kind="teacher"
      userSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu kind="teacher" />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
