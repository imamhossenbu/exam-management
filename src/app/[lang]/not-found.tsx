import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/i18n/client";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4">
      <div className="text-center">
        <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold"><T>Page not found</T></h1>
        <p className="text-subtle mt-2"><T>It may have been moved, or you may not have access to it.</T></p>
        <Button asChild className="mt-6">
          {/* A full navigation: /dashboard is a redirecting route handler, not a page. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/dashboard"><T>Go to dashboard</T></a>
        </Button>
      </div>
    </main>
  );
}
