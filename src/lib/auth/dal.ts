import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBase64DataUrl, saveAvatarFromBase64 } from "@/lib/auth/avatar";
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

  // 1. Fetch live auth user for latest metadata (avatar_url, student_class, etc.)
  const { data: userData } = await supabase.auth.getUser();
  const userMeta = (userData?.user?.user_metadata as Record<string, unknown>) ?? (claimsData?.claims?.user_metadata as Record<string, unknown>) ?? {};

  // 2. Fetch profile from database
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, timezone")
    .eq("id", uid)
    .maybeSingle();

  if (!profile) return null;

  const raw = profile as unknown as Record<string, unknown>;
  let avatar = (userMeta.avatar_url as string) || (raw.avatar_url as string) || null;
  const studentClass = (userMeta.student_class as string) || (raw.student_class as string) || null;
  const phone = (userMeta.phone as string) || (raw.phone as string) || null;
  const fullName = (userMeta.full_name as string) || profile.full_name || "";

  // Auto-heal: If user has a bloated base64 data URL in metadata, migrate it to disk and shrink cookies
  if (avatar && isBase64DataUrl(avatar)) {
    try {
      const cleanAvatar = await saveAvatarFromBase64(profile.id, avatar);
      avatar = cleanAvatar;
      await supabase.auth.updateUser({
        data: {
          ...userMeta,
          avatar_url: cleanAvatar,
        },
      });
    } catch (err) {
      console.error("[dal:cleanAvatar]", err);
    }
  }

  return {
    id: profile.id,
    role: profile.role,
    full_name: fullName,
    email: profile.email,
    timezone: profile.timezone,
    avatar_url: avatar,
    student_class: studentClass,
    phone: phone,
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
