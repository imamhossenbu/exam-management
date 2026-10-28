import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a free ExamDesk student account, then join your course with the invitation code from your teacher.",
  alternates: { canonical: "/signup" },
};

export default function SignUpPage() {
  return <SignUpForm />;
}
