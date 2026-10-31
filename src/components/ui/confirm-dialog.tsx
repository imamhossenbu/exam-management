"use client";

import * as React from "react";
import { AlertDialog as AlertPrimitive } from "radix-ui";
import { Button } from "./button";
import { trChildren } from "@/lib/i18n/tr";
import { T } from "@/lib/i18n/client";

type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Return false to keep the dialog open (e.g. when the action failed). */
  onConfirm: () => Promise<boolean | void> | boolean | void;
};

/** Confirmation for destructive or irreversible operations. */
export function ConfirmDialog({ trigger, title, description, confirmLabel = "Confirm", destructive, onConfirm }: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await onConfirm();
      if (result !== false) setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertPrimitive.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertPrimitive.Trigger asChild>{trigger}</AlertPrimitive.Trigger>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm animate-fade-in" />
        <AlertPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-surface p-6 shadow-overlay animate-pop-in">
          <AlertPrimitive.Title className="text-lg font-semibold tracking-tight">{trChildren(title)}</AlertPrimitive.Title>
          <AlertPrimitive.Description asChild>
            <div className="text-subtle">{trChildren(description)}</div>
          </AlertPrimitive.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                <T>Cancel</T>
              </Button>
            </AlertPrimitive.Cancel>
            <Button variant={destructive ? "destructive" : "default"} pending={pending} onClick={handleConfirm}>
              {trChildren(confirmLabel)}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
