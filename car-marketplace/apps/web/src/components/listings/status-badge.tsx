import { clsx } from "clsx";
import { labelFor } from "@cm/shared";
import type { Database } from "@cm/db";

type Status = Database["public"]["Enums"]["listing_status"];

const tones: Record<Status, string> = {
  draft: "bg-mist/60 text-ink-soft",
  pending_review: "bg-plate-soft text-ink",
  live: "bg-success-soft text-success",
  paused: "bg-mist/60 text-ink-soft",
  sold: "bg-ink text-white",
  expired: "bg-mist/60 text-ink-soft",
  rejected: "bg-danger-soft text-danger",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[status], className)}>
      {labelFor(status)}
    </span>
  );
}
