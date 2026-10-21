import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { parseChassis } from "@cm/shared";
import { getDealerStock, requireDealer } from "@/lib/dealers/queries";
import { Alert } from "@/components/ui/alert";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { BulkPhotos, type PhotoCar } from "./bulk-photos";

export const metadata: Metadata = { title: "Add photos", robots: { index: false } };

export default function PhotosPage({ params }: PageProps<"/dealer/[id]/photos">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Photos params={params} />
      </Suspense>
    </DealerFrame>
  );
}

async function Photos({ params }: Pick<PageProps<"/dealer/[id]/photos">, "params">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/photos`);
  const stock = dealer.status === "approved" ? await getDealerStock(id) : [];
  const cars: PhotoCar[] = stock
    .filter((s) => s.status && ["draft", "pending_review", "live", "paused", "rejected"].includes(s.status))
    .flatMap((s) => {
      const chassis = s.chassis_number ? parseChassis(s.chassis_number) : null;
      if (!chassis || !s.listing_id) return [];
      return [
        {
          listingId: s.listing_id,
          title: s.title ?? "Car",
          chassis: chassis.display,
          chassisKey: chassis.key,
          status: s.status!,
          photoCount: s.photo_count ?? 0,
          hasDashboard: !(s.missing ?? []).includes("dashboard photo"),
        },
      ];
    });

  return (
    <>
      <DealerHeader dealer={dealer} tab="upload" />
      <div className="mt-8">
        {cars.length ? (
          <BulkPhotos dealerId={id} cars={cars} />
        ) : (
          <Alert tone="info" className="max-w-2xl">
            Add your cars first, then their photos.{" "}
            <Link href={`/dealer/${id}/upload`} className="font-semibold underline underline-offset-4">
              Upload a spreadsheet
            </Link>
          </Alert>
        )}
      </div>
    </>
  );
}
