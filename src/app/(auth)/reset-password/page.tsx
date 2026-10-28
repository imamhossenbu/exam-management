import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" description="You're signed in through your reset link. Set a new password to continue.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
