import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBase64DataUrl, isLegacyDiskAvatar, saveAvatarFromBase64 } from "@/lib/auth/avatar";
import type { Enums } from "@/types/database";

export type CurrentProfile = {
  id: string;
  role: Enums<"app_role">;
  full_name: string;
  email: string | null;
  timezone: string;
  avatar_url?: string | null;
  student_class?: string | null;
  phone?: string | null;
};

/**
 * Resolves the signed-in user's profile. The identity comes from a verified
 * JWT (getClaims) and the role from the database — never from the browser.
 * Deduplicated per request with React cache().
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (error || !uid) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, timezone, avatar_url, student_class, phone")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) return null;

  // The profiles row is the source of truth. Accounts edited before the profile columns existed
  // only have these values in their auth metadata (already in the verified JWT: no extra request).
  const meta = (claimsData?.claims?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const fromMeta = (key: string) => (typeof meta[key] === "string" && meta[key] ? (meta[key] as string) : null);
  let avatar = profile.avatar_url || fromMeta("avatar_url");
  if (isLegacyDiskAvatar(avatar)) avatar = null; // old on-disk paths never resolved

  // One-time repair: a photo still stored inline (base64) in metadata moves to Storage.
  if (avatar && isBase64DataUrl(avatar)) {
    try {
      avatar = await saveAvatarFromBase64(supabase, profile.id, avatar);
      await supabase.from("profiles").update({ avatar_url: avatar }).eq("id", profile.id);
      await supabase.auth.updateUser({ data: { avatar_url: avatar } });
    } catch (err) {
      console.error("[dal:moveAvatar]", err);
      avatar = null;
    }
  }

  return {
    id: profile.id,
    role: profile.role,
    full_name: profile.full_name || fromMeta("full_name") || "",
    email: profile.email,
    timezone: profile.timezone,
    avatar_url: avatar,
    student_class: profile.student_class || fromMeta("student_class"),
    phone: profile.phone || fromMeta("phone"),
  };
});

export async function requireUser() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  return { profile, supabase };
}

export async function requireTeacher() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "teacher") redirect("/student");
  return ctx;
}

export async function requireStudent() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "student") redirect("/teacher");
  return ctx;
}

export function homeFor(role: Enums<"app_role">) {
  return role === "teacher" ? "/teacher" : "/student";
}
