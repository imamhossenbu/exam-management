import type { z } from "zod";
import { toUserMessage } from "@/lib/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Logs the raw error server-side (no secrets in Supabase errors) and returns a safe message. */
export function dbFail(error: { code?: string; message?: string; details?: string | null }, context: string, fallback?: string) {
  console.error(`[action:${context}]`, error.code, error.message);
  return fail(toUserMessage(error, fallback));
}

export function invalid(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail(error.issues[0]?.message ?? "Some values are invalid.", fieldErrors);
}
