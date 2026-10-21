import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { getVerifiedDealers } from "@/lib/dealers/public";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Verified car dealers in Kenya",
  description: "Car dealers whose KRA PIN and business registration we've checked, with every car they have in stock.",
  alternates: { canonical: "/dealers" },
};

export default function DealersPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Verified dealers</h1>
      <p className="mt-3 max-w-[60ch] text-lg text-ink-soft">
        Every dealer here has shown us their KRA PIN certificate, business registration and the owner&apos;s ID. Their cars
        carry a Vehicle Passport like everyone else&apos;s.
      </p>
      <Suspense fallback={<div aria-hidden className="mt-8 h-60 rounded-[var(--radius-control)] bg-mist/50" />}>
        <DealerList />
      </Suspense>
      <div className="mt-12 rounded-[var(--radius-control)] border border-mist bg-surface p-5">
        <p className="text-lg font-semibold">Run a car yard?</p>
        <p className="mt-1 text-ink-soft">Upload your stock from a spreadsheet and answer buyers as a team.</p>
        <Link href="/dealer" className={buttonClass("primary", "md", "mt-4")}>
          Apply as a dealer
        </Link>
      </div>
    </div>
  );
}

async function DealerList() {
  const dealers = await getVerifiedDealers();
  if (!dealers.length) return <p className="mt-8 text-muted">The first verified dealers are joining now.</p>;
  return (
    <ul className="mt-8 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
      {dealers.map((d) => (
        <li key={d.slug}>
          <Link href={`/dealers/${d.slug}`} className="flex items-center gap-4 px-4 py-4 hover:bg-paper">
            <BadgeCheck aria-hidden className="size-6 shrink-0 text-forest" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{d.name}</p>
              <p className="text-sm text-muted">{[d.town, d.countyName].filter(Boolean).join(", ")}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold">{d.liveCars === 1 ? "1 car" : `${d.liveCars} cars`}</span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
