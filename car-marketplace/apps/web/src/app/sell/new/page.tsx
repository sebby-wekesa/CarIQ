import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/catalogue";
import { getMyDealers } from "@/lib/dealers/queries";
import { Alert } from "@/components/ui/alert";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "List a car", robots: { index: false } };

export default function NewListingPage({ searchParams }: PageProps<"/sell/new">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">List a car</h1>
      <p className="mt-3 text-ink-soft">Start with the car itself. Photos, price and papers come next.</p>
      <div className="mt-8">
        <Suspense fallback={<div aria-hidden className="h-72 rounded-[var(--radius-control)] bg-mist/50" />}>
          <StartFormWithCatalogue searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function StartFormWithCatalogue({ searchParams }: Pick<PageProps<"/sell/new">, "searchParams">) {
  await requireUser("/sell/new");
  const [catalogue, dealers, params] = await Promise.all([getCatalogue(), getMyDealers(), searchParams]);
  if (!catalogue) return <Alert tone="error">The list of makes didn&apos;t load. Refresh the page to try again.</Alert>;
  // Dealer staff choose who the car is listed for; only approved dealers can list.
  const sellers = dealers.filter((d) => d.status === "approved").map((d) => ({ id: d.id, name: d.name }));
  const wanted = typeof params.dealer === "string" ? params.dealer : undefined;
  const defaultDealer = sellers.find((d) => d.id === wanted)?.id ?? (wanted === undefined ? sellers[0]?.id : undefined) ?? "";
  return <StartForm makes={catalogue.makes} models={catalogue.models} dealers={sellers} defaultDealerId={defaultDealer} />;
}
