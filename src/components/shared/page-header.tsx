import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trChildren } from "@/lib/i18n/tr";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {trChildren(item.label)}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {trChildren(item.label)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 sm:mb-6">
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title break-words">{trChildren(title)}</h1>
          {description ? <div className="text-subtle mt-1 max-w-2xl">{trChildren(description)}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
