"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";
import { SidebarNav } from "./sidebar-nav";
import { Brand } from "./brand";
import type { NavKind } from "./nav-config";

export function MobileNav({ kind }: { kind: NavKind }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu aria-hidden />
        </Button>
      </DialogTrigger>
      <SheetContent aria-describedby={undefined}>
        <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
        <div className="flex h-16 items-center px-6">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav kind={kind} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Dialog>
  );
}
