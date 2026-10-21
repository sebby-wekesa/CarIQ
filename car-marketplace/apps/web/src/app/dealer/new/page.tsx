import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { ApplyForm } from "../apply-form";
import { DealerFrame, DealerSkeleton } from "../dealer-header";

export const metadata: Metadata = { title: "Apply as a dealer", robots: { index: false } };

export default function NewDealerPage() {
  return (
    <DealerFrame>
      <div className="max-w-2xl">
        <h1 className="display text-4xl sm:text-5xl">Apply for a new dealership</h1>
        <Suspense fallback={<DealerSkeleton />}>
          <NewDealer />
        </Suspense>
      </div>
    </DealerFrame>
  );
}

async function NewDealer() {
  const user = await requireUser("/dealer/new");
  if (user.needsProfile) {
    return (
      <Alert tone="info" className="mt-6">
        First add your own name and county.{" "}
        <Link href="/account?welcome=1&next=%2Fdealer%2Fnew" className="font-semibold underline underline-offset-4">
          Finish your profile
        </Link>
      </Alert>
    );
  }
  return (
    <div className="mt-6">
      <ApplyForm defaultCounty={user.countyCode} />
    </div>
  );
}
