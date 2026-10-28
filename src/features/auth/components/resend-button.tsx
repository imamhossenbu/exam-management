"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOLDOWN_SECONDS = 60;

/** "Resend email" with a cooldown so students can't trip the email rate limit. */
export function ResendButton({ onResend, pending }: { onResend: () => Promise<boolean>; pending: boolean }) {
  const [remaining, setRemaining] = React.useState(COOLDOWN_SECONDS);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-60"
      disabled={remaining > 0}
      pending={pending}
      onClick={async () => {
        if (await onResend()) setRemaining(COOLDOWN_SECONDS);
      }}
    >
      {pending ? null : <RotateCw aria-hidden />}
      {remaining > 0 ? `Resend email in ${remaining}s` : "Resend email"}
    </Button>
  );
}
