import { clsx } from "clsx";

/**
 * The brand mark: the name set on a Kenyan rear number plate — yellow, black
 * lettering, two fixing screws. Purely typographic so it stays crisp at any size.
 */
export function PlateMark({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    sm: "h-7 px-4 text-sm gap-2",
    md: "h-9 px-5 text-lg gap-2.5",
    lg: "h-14 px-8 text-3xl gap-4",
  } as const;
  const screw = { sm: "size-1", md: "size-1.5", lg: "size-2" } as const;

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-[var(--radius-plate)] border-2 border-ink bg-plate text-ink",
        "shadow-[inset_0_0_0_2px_var(--color-plate),inset_0_0_0_3px_rgb(16_35_28/0.35)]",
        sizes[size],
        className,
      )}
    >
      <span aria-hidden className={clsx("rounded-full bg-ink/45", screw[size])} />
      <span className="plate-type leading-none">{name}</span>
      <span aria-hidden className={clsx("rounded-full bg-ink/45", screw[size])} />
    </span>
  );
}
