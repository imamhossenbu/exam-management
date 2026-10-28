"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { getSiteUrl } from "@/lib/site-url";
import { homeFor, requireUser } from "@/lib/auth/dal";
import { isValidTimeZone } from "@/lib/utils/datetime";
import {
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";
import { refresh } from "next/cache";

function authMessage(error: { code?: string; message: string; status?: number }) {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Confirm your email address first — check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in.";
    case "weak_password":
      return "That password is too weak. Choose a longer, less common one.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "same_password":
      return "Choose a password different from your current one.";
    default:
      return error.status === 429 ? "Too many attempts. Please wait a few minutes." : "Authentication failed. Please try again.";
  }
}

async function roleHome(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data ? homeFor(data.role) : "/dashboard";
}

export async function signInAction(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return fail(authMessage(error));
  const next = safeNextPath(parsed.data.next);
  // Go straight to the role's home: redirecting to the /dashboard route handler from an
  // action would render the right page but leave /dashboard in the address bar.
  redirect(next === "/dashboard" ? await roleHome(supabase, data.user.id) : next);
}

export async function signUpAction(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const site = await getSiteUrl();
  // Only full_name is sent as metadata; the role is always assigned by the database.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${site}/auth/confirm?next=/student`,
    },
  });
  if (error) return fail(authMessage(error));
  if (data.session) redirect("/student");
  return ok({ needsConfirmation: true }, "Check your email to confirm your account.");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const site = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/confirm?next=/reset-password`,
  });
  // Always respond the same way so the form can't be used to probe for accounts.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return fail(authMessage(error));
  return ok(undefined, "If an account exists for that email, a reset link is on its way.");
}

export async function resendConfirmationAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const site = await getSiteUrl();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${site}/auth/confirm?next=/student` },
  });
  // Same response whether or not the account exists, except for rate limits.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return fail(authMessage(error));
  return ok(undefined, "A new confirmation email is on its way.");
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<{ home: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(authMessage(error));
  return ok({ home: await roleHome(supabase, claims.claims.sub) });
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!isValidTimeZone(parsed.data.timezone)) return fail("Choose a valid timezone.", { timezone: ["Choose a valid timezone."] });
  const { profile, supabase } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, timezone: parsed.data.timezone })
    .eq("id", profile.id);
  if (error) {
    console.error("[action:updateProfile]", error.code, error.message);
    return fail("We couldn't save your profile. Please try again.");
  }
  refresh();
  return ok(undefined, "Profile updated");
}
