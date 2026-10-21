import type { Metadata } from "next";
import { Suspense } from "react";
import { requireDealer } from "@/lib/dealers/queries";
import { DealerFrame, DealerSkeleton } from "../dealer-header";
import { DealerOverview } from "../overview";

export const metadata: Metadata = { title: "Dealer dashboard", robots: { index: false } };

export default function DealerPage({ params, searchParams }: PageProps<"/dealer/[id]">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </DealerFrame>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/dealer/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}`);
  const welcome = (await searchParams).welcome === "1";
  return <DealerOverview dealer={dealer} welcome={welcome} />;
}
