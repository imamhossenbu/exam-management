"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Inline error with a retry that re-fetches server data for the current route. */
export function ErrorState({
  title = "We couldn't load this",
  message = "Please check your connection and try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-danger/30 bg-danger-soft/40 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-danger" aria-hidden />
      <h3 className="section-title">{title}</h3>
      <p className="text-subtle mt-1 max-w-md">{message}</p>
      <Button
        variant="outline"
        className="mt-4"
        pending={pending}
        onClick={() => startTransition(() => (onRetry ? onRetry() : router.refresh()))}
      >
        {!pending ? <RotateCw aria-hidden /> : null}
        Try again
      </Button>
    </div>
  );
}
