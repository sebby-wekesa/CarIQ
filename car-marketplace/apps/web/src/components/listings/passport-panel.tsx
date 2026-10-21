import { CircleDashed, FileCheck2, Gauge, ShieldCheck } from "lucide-react";
import { DOCUMENT_KINDS } from "@cm/shared";
import { formatDate } from "@/lib/format";
import type { PassportSummary } from "@/lib/listings/queries";

const km = new Intl.NumberFormat("en-KE");

const SOURCE: Record<string, string> = {
  listing: "Seller's listing",
  auction_sheet: "Japanese auction",
  shaken: "Japanese inspection",
  jevic: "JEVIC check",
  qisj: "QISJ inspection",
  inspection: "Our inspection",
  service: "Service visit",
};

const LEVEL: Record<string, string> = {
  declared: "as stated",
  provided: "with photo, not yet checked",
  checked: "checked by us",
  verified: "verified",
};

/**
 * What a buyer can see of the car's Vehicle Passport. Wording is deliberately exact:
 * nothing reads as "verified" until it has been checked at source.
 */
export function PassportPanel({ passport }: { passport: PassportSummary | null }) {
  const docs = passport?.documents ?? [];
  const readings = passport?.readings ?? [];
  const papers = DOCUMENT_KINDS.filter((d) => d.kind !== "odometer_photo");

  return (
    <section aria-labelledby="passport-heading" className="rounded-[var(--radius-control)] border-2 border-ink bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4">
        <h2 id="passport-heading" className="display flex items-center gap-2 text-2xl">
          <ShieldCheck aria-hidden className="size-6 text-forest" />
          Vehicle Passport
        </h2>
        {passport?.vehicle ? (
          <p className="text-right text-sm text-muted">
            Chassis <span className="font-semibold text-ink">{passport.vehicle.chassis_masked}</span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Gauge aria-hidden className="size-4 text-muted" />
            Mileage history
          </h3>
          {readings.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-2.5 border-l-2 border-mist pl-4">
              {readings.map((reading, i) => (
                <li key={`${reading.read_on}-${i}`}>
                  <p className="font-semibold">{km.format(reading.reading_km)} km</p>
                  <p className="text-sm text-muted">
                    {formatDate(reading.read_on)}, {SOURCE[reading.source] ?? reading.source},{" "}
                    {LEVEL[reading.verification_level] ?? reading.verification_level}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">No readings recorded yet.</p>
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileCheck2 aria-hidden className="size-4 text-muted" />
            Papers
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {papers.map((paper) => {
              const doc = docs.find((d) => d.kind === paper.kind);
              return (
                <li key={paper.kind} className="flex items-start gap-2 text-sm">
                  {doc ? (
                    <FileCheck2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  )}
                  <span>
                    <span className={doc ? "font-semibold" : "text-muted"}>{paper.label}</span>
                    <span className="block text-muted">
                      {doc ? (doc.verification_level === "provided" ? "Provided, not yet checked" : LEVEL[doc.verification_level]) : "Not provided"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="border-t border-mist px-5 py-3 text-sm text-ink-soft">
        The Passport stays with this car through every sale. Papers and readings count as verified only after we
        check them against the issuer or our own inspection.
      </p>
    </section>
  );
}
