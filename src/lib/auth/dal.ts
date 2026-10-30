import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { data, error } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (error || !uid) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, timezone")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) return null;
  const meta = (data?.claims?.user_metadata as Record<string, unknown>) ?? {};
  return {
    ...profile,
    avatar_url: (meta.avatar_url as string) || null,
    student_class: (meta.student_class as string) || null,
    phone: (meta.phone as string) || null,
    full_name: (meta.full_name as string) || profile.full_name,
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
