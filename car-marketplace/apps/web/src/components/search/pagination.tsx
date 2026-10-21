import Link from "next/link";
import { clsx } from "clsx";
import { searchHref, type SearchFilters, type SearchSort } from "@cm/shared";
import { pageNumbers } from "@/lib/search/paging";

type Props = { filters: SearchFilters; sort: SearchSort; page: number; pages: number };

/** 1 … 4 5 [6] 7 8 … 20, with previous and next. Plain links, so every page is crawlable. */
export function Pagination({ filters, sort, page, pages }: Props) {
  if (pages <= 1) return null;
  const href = (p: number) => searchHref(filters, { sort, page: p });
  const numbers = pageNumbers(page, pages);
  const item = "grid min-h-11 min-w-11 place-items-center rounded-[var(--radius-control)] px-3 font-semibold";

  return (
    <nav aria-label="Pages" className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={clsx(item, "border border-ink/20 bg-surface hover:border-ink/40")}>
          Previous
        </Link>
      ) : null}
      {numbers.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-muted">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={clsx(item, "bg-ink text-white")}>
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} className={clsx(item, "hover:bg-surface")} aria-label={`Page ${n}`}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" className={clsx(item, "border border-ink/20 bg-surface hover:border-ink/40")}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
