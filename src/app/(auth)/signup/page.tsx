import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a free ExamDesk student account, then join your course with the invitation code from your teacher.",
  alternates: { canonical: "/signup" },
};

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your student account"
      description="After signing up, join your course with the invitation code from your teacher."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
