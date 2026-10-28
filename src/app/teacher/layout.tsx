import { Suspense } from "react";
import { AppShell } from "@/components/shared/app-shell";
import { UserMenu, UserMenuSkeleton } from "@/components/shared/user-menu";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
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
