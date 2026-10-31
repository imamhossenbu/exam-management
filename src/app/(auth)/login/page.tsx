import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import { AuthCard } from "@/components/shared/auth-card";
import { FormSkeleton } from "@/components/shared/skeletons";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeNextPath } from "@/lib/validations/auth";
import { T } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to ExamDesk to take exams, check results and manage your courses.",
  alternates: { canonical: "/login" },
};

async function LoginForm({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "session_expired" ? (
        <p role="alert" className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning">
          <T>Your session expired. Please sign in again.</T>
        </p>
      ) : null}
      <SignInForm next={safeNextPath(next)} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      icon={LogIn}
      title="Welcome back"
      description="Sign in to your exam workspace."
      footer={
        <>
          New student?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            <T>Create an account</T>
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <LoginForm searchParams={searchParams as Promise<{ next?: string; error?: string }>} />
      </Suspense>
    </AuthCard>
  );
}
