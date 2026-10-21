import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, string> = {
  error: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success/30 bg-success-soft text-success",
  info: "border-plate bg-plate-soft text-ink",
};

export function Alert({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("rounded-[var(--radius-control)] border px-4 py-3 text-sm font-medium", tones[tone], className)}
    >
      {children}
    </div>
  );
}
