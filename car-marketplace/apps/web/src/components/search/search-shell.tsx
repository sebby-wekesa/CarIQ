"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition, type ReactNode } from "react";

type SearchNav = { navigate: (href: string) => void; pending: boolean };

const SearchNavContext = createContext<SearchNav | null>(null);

/** Shares one navigation transition between the filters, sort and results on a search page. */
export function SearchShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => startTransition(() => router.push(href, { scroll: false })),
    [router],
  );
  const value = useMemo(() => ({ navigate, pending }), [navigate, pending]);
  return <SearchNavContext value={value}>{children}</SearchNavContext>;
}

export function useSearchNav(): SearchNav {
  const value = useContext(SearchNavContext);
  if (!value) throw new Error("useSearchNav must be used inside <SearchShell>");
  return value;
}

/** Fades the results while new ones load, so a tap on a filter visibly did something. */
export function ResultsRegion({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  const { pending } = useSearchNav();
  return (
    <section
      aria-labelledby={labelledBy}
      aria-busy={pending || undefined}
      className={clsx("min-w-0 transition-opacity duration-150", pending && "pointer-events-none opacity-50")}
    >
      {children}
    </section>
  );
}
