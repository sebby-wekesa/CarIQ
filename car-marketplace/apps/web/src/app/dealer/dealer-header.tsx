import Link from "next/link";
import { clsx } from "clsx";
import type { MyDealer } from "@/lib/dealers/queries";
import { VerifiedDealerBadge } from "@/components/dealers/verified-badge";

export type DealerTab = "overview" | "stock" | "upload" | "leads" | "team" | "showroom" | "billing";

const TABS: { tab: DealerTab; label: string; path: string }[] = [
  { tab: "overview", label: "Overview", path: "" },
  { tab: "stock", label: "Stock", path: "/stock" },
  { tab: "upload", label: "Add cars", path: "/upload" },
  { tab: "leads", label: "Leads", path: "/leads" },
  { tab: "team", label: "Team", path: "/team" },
  { tab: "showroom", label: "Showroom", path: "/showroom" },
  { tab: "billing", label: "Plan and billing", path: "/billing" },
];

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting for approval", className: "bg-plate-soft text-ink" },
  rejected: { label: "Changes needed", className: "bg-danger-soft text-danger" },
  suspended: { label: "Suspended", className: "bg-danger-soft text-danger" },
};

/** Dealer name, status and the section tabs. */
export function DealerHeader({ dealer, tab }: { dealer: MyDealer; tab: DealerTab }) {
  const status = STATUS[dealer.status];
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Dealer dashboard</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="display text-3xl sm:text-4xl">{dealer.name}</h1>
        {dealer.status === "approved" ? (
          <VerifiedDealerBadge />
        ) : status ? (
          <span className={clsx("rounded-full px-2.5 py-1 text-sm font-semibold", status.className)}>{status.label}</span>
        ) : null}
      </div>
      <nav aria-label="Dealer dashboard" className="-mx-4 mt-5 overflow-x-auto border-b border-mist px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.tab}>
              <Link
                href={`/dealer/${dealer.id}${t.path}`}
                aria-current={t.tab === tab ? "page" : undefined}
                className={clsx(
                  "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-3 px-3 font-semibold",
                  t.tab === tab ? "border-forest text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function DealerFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>;
}

export function DealerSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="h-10 w-2/3 rounded bg-mist" />
      <div className="h-11 rounded bg-mist/60" />
      <div className="h-60 rounded-[var(--radius-control)] bg-mist/40" />
    </div>
  );
}
