"use client";

import * as React from "react";
import { toast } from "sonner";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/action-result";

type Options<TData> = {
  /** Toast shown on success when the action doesn't provide its own message. */
  successMessage?: string;
  /** Set to false when the UI itself shows the success state. */
  successToast?: boolean;
  onSuccess?: (data: TData) => void;
  onError?: (result: Extract<ActionResult<TData>, { ok: false }>) => void;
};

/**
 * Runs a Server Action with a pending flag (to block duplicate submissions),
 * success/error toasts and network-failure handling.
 */
export function useServerAction<TArgs extends unknown[], TData>(
  action: (...args: TArgs) => Promise<ActionResult<TData>>,
  options: Options<TData> = {},
) {
  const [pending, startTransition] = React.useTransition();
  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  });

  const run = React.useCallback(
    (...args: TArgs) =>
      new Promise<ActionResult<TData> | undefined>((resolve) => {
        startTransition(async () => {
          const { successMessage, successToast = true, onSuccess, onError } = optionsRef.current;
          try {
            const result = await action(...args);
            // A redirecting action resolves without a result; navigation is handled by Next.js.
            if (!result) return resolve(undefined);
            if (result.ok) {
              const message = result.message ?? successMessage;
              if (message && successToast) toast.success(message);
              onSuccess?.(result.data);
            } else {
              toast.error(result.error);
              onError?.(result);
            }
            resolve(result);
          } catch (error) {
            if (isNavigationError(error)) throw error;
            console.error(error);
            toast.error("We couldn't reach the server. Check your connection and try again.");
            resolve(undefined);
          }
        });
      }),
    [action],
  );

  return { run, pending };
}

function isNavigationError(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/** Copies server-side field errors onto a react-hook-form instance. */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  result: ActionResult<unknown> | undefined,
) {
  if (!result || result.ok || !result.fieldErrors) return;
  for (const [field, messages] of Object.entries(result.fieldErrors)) {
    if (field !== "_form") setError(field as Path<T>, { type: "server", message: messages[0] });
  }
}
