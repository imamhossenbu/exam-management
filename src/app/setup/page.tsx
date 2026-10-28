import type { Metadata } from "next";
import { Settings2 } from "lucide-react";

export const metadata: Metadata = { title: "Configuration required", robots: { index: false, follow: false } };

/** Shown when required environment variables are missing (see proxy). Never displays values. */
export default function SetupPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="surface max-w-lg p-8">
        <Settings2 className="mb-3 size-8 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold">Configuration required</h1>
        <p className="text-subtle mt-2">
          The app can&apos;t reach Supabase because required environment variables are missing or still contain placeholder values.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
          <li>
            Copy <code className="font-mono">.env.local.example</code> to <code className="font-mono">.env.local</code>.
          </li>
          <li>
            Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> from
            Supabase Dashboard → Project Settings → API Keys.
          </li>
          <li>Restart the dev server (or redeploy on Vercel after adding the variables).</li>
        </ol>
      </div>
    </main>
  );
}
