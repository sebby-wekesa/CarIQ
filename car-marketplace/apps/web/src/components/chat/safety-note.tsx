import { ShieldAlert } from "lucide-react";
import { clsx } from "clsx";

/** The one rule that prevents most car-sale fraud in Kenya, said plainly. */
export function SafetyNote({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={clsx("flex gap-2.5 rounded-[var(--radius-control)] bg-plate-soft px-3.5 py-2.5 text-sm text-ink", className)}>
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        {compact
          ? "Never send a deposit or fee before you have seen the car and checked its logbook on eCitizen."
          : "Keep the conversation here so we can help if something goes wrong. Never send a deposit, booking fee or viewing fee before you have seen the car and checked its logbook on eCitizen."}
      </p>
    </div>
  );
}
