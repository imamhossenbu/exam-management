import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth-card";
import { FormSkeleton } from "@/components/shared/skeletons";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeNextPath } from "@/lib/validations/auth";

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
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Your session expired. Please sign in again.
        </p>
      ) : null}
      <SignInForm next={safeNextPath(next)} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your exam workspace."
      footer={
        <>
          New student?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
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
