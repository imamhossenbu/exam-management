import Link from "next/link";
import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Link expired" };

export default function AuthErrorPage() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-warning/15 ring-1 ring-warning/30">
        <LinkIcon className="size-7 text-warning" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">This link has expired</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/75">
        Email links work only once and expire after a short time. If you already confirmed your email, just sign in.
      </p>
      <div className="mt-7 grid w-full gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10">
          <Link href="/forgot-password">Send a new reset link</Link>
        </Button>
      </div>
    </div>
  );
}
