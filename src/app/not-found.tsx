import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4">
      <div className="text-center">
        <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-subtle mt-2">It may have been moved, or you may not have access to it.</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
