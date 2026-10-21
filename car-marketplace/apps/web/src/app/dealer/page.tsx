import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { DEALER_ROLE_LABELS } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { getMyDealers } from "@/lib/dealers/queries";
import { Alert } from "@/components/ui/alert";
import { ApplyForm } from "./apply-form";
import { DealerFrame, DealerSkeleton } from "./dealer-header";
import { DealerOverview } from "./overview";

export const metadata: Metadata = { title: "Dealer dashboard", robots: { index: false } };

export default function DealerHome() {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Hub />
      </Suspense>
    </DealerFrame>
  );
}

async function Hub() {
  const user = await requireUser("/dealer");
  const dealers = await getMyDealers();

  if (dealers.length === 1) return <DealerOverview dealer={dealers[0]!} welcome={false} />;

  if (dealers.length > 1) {
    return (
      <>
        <h1 className="display text-4xl sm:text-5xl">Your dealerships</h1>
        <ul className="mt-8 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
          {dealers.map((d) => (
            <li key={d.id}>
              <Link href={`/dealer/${d.id}`} className="flex items-center gap-4 p-4 hover:bg-paper">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{d.name}</p>
                  <p className="text-sm text-muted">
                    {DEALER_ROLE_LABELS[d.role]} · {d.status === "approved" ? "Verified" : d.status === "pending" ? "Waiting for approval" : "Changes needed"}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted">
          Registering another business? <Link href="/dealer/new" className="font-semibold text-forest underline-offset-4 hover:underline">Apply for a new dealership</Link>.
        </p>
      </>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="display text-4xl sm:text-5xl">Sell your stock as a verified dealer</h1>
      <p className="mt-3 text-lg text-ink-soft">
        Upload your whole yard from a spreadsheet, share chats and leads with your sales team, and get the Verified
        dealer badge on every car once we&apos;ve checked your business.
      </p>
      <ul className="mt-6 grid gap-3 text-ink-soft sm:grid-cols-3">
        {[
          ["1. Apply", "Business name, KRA PIN and location. Two minutes."],
          ["2. Send documents", "KRA PIN certificate, business registration, owner's ID."],
          ["3. Get verified", "We check them, usually within one working day."],
        ].map(([title, text]) => (
          <li key={title} className="rounded-[var(--radius-control)] border border-mist bg-surface p-4">
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        Invited by a dealership? Sign in with the number they added and you&apos;ll find it here. If not, ask them to add you
        from their Team page.
      </p>
      <h2 className="mt-10 text-2xl font-bold">Apply as a dealer</h2>
      {user.needsProfile ? (
        <Alert tone="info" className="mt-4">
          First add your own name and county.{" "}
          <Link href="/account?welcome=1&next=%2Fdealer" className="font-semibold underline underline-offset-4">
            Finish your profile
          </Link>
        </Alert>
      ) : (
        <div className="mt-6">
          <ApplyForm defaultCounty={user.countyCode} />
        </div>
      )}
    </div>
  );
}
