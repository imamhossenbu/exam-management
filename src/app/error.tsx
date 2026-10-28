"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <ErrorState title="Something went wrong" message="An unexpected error occurred. Your work has not been lost." onRetry={reset} />
    </main>
  );
}
