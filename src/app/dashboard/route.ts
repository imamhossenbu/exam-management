import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile, homeFor } from "@/lib/auth/dal";

/** Sends a signed-in user to their role's home. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  const target = profile ? homeFor(profile.role) : "/login";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
