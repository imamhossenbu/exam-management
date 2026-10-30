"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils/cn";

const COOLDOWN_SECONDS = 60;

type ResendButtonProps = {
  onResend: () => Promise<boolean>;
  pending: boolean;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
};

/** "Resend email/code" with a cooldown so students can't trip the email rate limit. */
export function ResendButton({
  onResend,
  pending,
  label = "email",
  variant = "outline",
  size = "lg",
  className,
}: ResendButtonProps) {
  const [remaining, setRemaining] = React.useState(COOLDOWN_SECONDS);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(
        "border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-60 transition-colors",
        size === "lg" && "w-full",
        className,
      )}
      disabled={remaining > 0}
      pending={pending}
      onClick={async () => {
        if (await onResend()) setRemaining(COOLDOWN_SECONDS);
      }}
    >
      {pending ? null : <RotateCw className="size-3.5 shrink-0" aria-hidden />}
      <span>
        {remaining > 0 ? `Resend ${label} in ${remaining}s` : `Resend ${label}`}
      </span>
    </Button>
  );
}
