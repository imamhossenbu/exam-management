import Link from "next/link";
import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthCard, AuthSteps } from "@/components/shared/auth-card";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Link expired", robots: { index: false, follow: false } };

export default function AuthErrorPage() {
  return (
    <AuthCard
      icon={LinkIcon}
      tone="warning"
      title="This link has expired"
      description="Email links work only once and expire after 1 hour. Here's how to continue:"
    >
      <AuthSteps
        steps={[
          <>
            <span className="font-medium text-white"><T>Already confirmed your email?</T></span> Just sign in.
          </>,
          <>
            <span className="font-medium text-white"><T>Resetting your password?</T></span> Request a new reset link.
          </>,
          <>
            <span className="font-medium text-white"><T>Still need to confirm?</T></span> Sign in — we&apos;ll tell you, and you can sign up again to get a new link.
          </>,
        ]}
      />
      <div className="mt-6 grid gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/login"><T>Sign in</T></Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10">
          <Link href="/forgot-password"><T>Send a new reset link</T></Link>
        </Button>
      </div>
    </AuthCard>
  );
}
