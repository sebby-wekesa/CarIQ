import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Visible trail; the last item is the current page. */
export function Breadcrumbs({ items }: { items: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
            {i === items.length - 1 ? (
              <span aria-current="page" className="font-medium text-ink-soft">
                {item.name}
              </span>
            ) : (
              <Link href={item.href} className="underline-offset-4 hover:text-ink hover:underline">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
