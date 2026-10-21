import type { Metadata } from "next";
import { Suspense } from "react";
import type { CatalogueModel } from "@cm/shared";
import { getCatalogue } from "@/lib/catalogue";
import { requireDealer } from "@/lib/dealers/queries";
import { Alert } from "@/components/ui/alert";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { StockUpload } from "./stock-upload";

export const metadata: Metadata = { title: "Add cars", robots: { index: false } };

export default function UploadPage({ params }: PageProps<"/dealer/[id]/upload">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Upload params={params} />
      </Suspense>
    </DealerFrame>
  );
}

async function Upload({ params }: Pick<PageProps<"/dealer/[id]/upload">, "params">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/upload`);
  if (dealer.status !== "approved") {
    return (
      <>
        <DealerHeader dealer={dealer} tab="upload" />
        <Alert tone="info" className="mt-8 max-w-2xl">
          You can add cars once we&apos;ve approved the dealership. Meanwhile, get your list ready in the{" "}
          <a href="/dealer/stock-template.csv" download className="font-semibold underline underline-offset-4">
            spreadsheet template
          </a>
          .
        </Alert>
      </>
    );
  }

  const catalogue = await getCatalogue();
  const makes = new Map((catalogue?.makes ?? []).map((m) => [m.id, m]));
  const models: CatalogueModel[] = (catalogue?.models ?? []).flatMap((m) => {
    const make = makes.get(m.makeId);
    return make ? [{ id: m.id, name: m.name, slug: m.slug, makeName: make.name, makeSlug: make.slug, bodyType: m.bodyType }] : [];
  });

  return (
    <>
      <DealerHeader dealer={dealer} tab="upload" />
      <div className="mt-8">
        {models.length ? (
          <StockUpload dealerId={id} catalogue={models} />
        ) : (
          <Alert tone="error">The list of makes and models didn&apos;t load. Refresh the page.</Alert>
        )}
      </div>
    </>
  );
}
