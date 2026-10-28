import { Suspense } from "react";
import { AppShell } from "@/components/shared/app-shell";
import { UserMenu, UserMenuSkeleton } from "@/components/shared/user-menu";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
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
