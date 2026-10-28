"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/actions";

/**
 * Calls the sign-out Server Action directly. (A <form> inside the menu is
 * unmounted when the menu closes, which cancels its submission.)
 */
export function SignOutItem() {
  const [pending, startTransition] = React.useTransition();
  return (
    <DropdownMenuItem
      disabled={pending}
      onSelect={() =>
        startTransition(async () => {
          try {
            await signOutAction();
          } catch (error) {
            const digest = (error as { digest?: string } | null)?.digest;
            if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
            toast.error("Couldn't sign out. Check your connection and try again.");
          }
        })
      }
    >
      <LogOut aria-hidden /> {pending ? "Signing out…" : "Sign out"}
    </DropdownMenuItem>
  );
}
