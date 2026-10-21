import { clsx } from "clsx";
import { BadgeCheck } from "lucide-react";

/** Shown on a dealer's cars and showroom once we've checked its KRA PIN and registration. */
export function VerifiedDealerBadge({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full bg-forest font-semibold text-white",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
    >
      <BadgeCheck aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      Verified dealer
    </span>
  );
}
