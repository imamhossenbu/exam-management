import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/shared/brand";

/** Auth screens: a single glass card on a fixed mesh-gradient backdrop. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-glass relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[oklch(0.16_0.035_282)] px-4 py-12">
      {/* Mesh backdrop */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[oklch(0.55_0.24_277)] opacity-50 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 size-[30rem] rounded-full bg-[oklch(0.6_0.24_320)] opacity-40 blur-[120px]" />
        <div className="absolute -bottom-48 left-1/4 size-[32rem] rounded-full bg-[oklch(0.62_0.15_220)] opacity-30 blur-[130px]" />
        <div className="bg-grid absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>

      <div className="w-full max-w-[26rem]">
        <div className="relative rounded-[1.75rem] border border-white/15 bg-white/[0.07] p-8 shadow-[0_24px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/5 ring-inset backdrop-blur-2xl backdrop-saturate-150 sm:p-10">
          {/* Top edge highlight */}
          <div className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" aria-hidden />
          <Link href="/" className="mb-8 flex justify-center rounded-lg focus-ring">
            <Brand />
          </Link>
          {children}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-white/55">
          <ShieldCheck className="size-3.5" aria-hidden /> Secured with encrypted sessions and row-level security
        </p>
      </div>
    </div>
  );
}
