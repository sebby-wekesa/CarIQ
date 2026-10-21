import Link from "next/link";
import { clsx } from "clsx";

export function SavedTabs({ active }: { active: "cars" | "searches" }) {
  const tab = (key: "cars" | "searches", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={clsx(
        "-mb-px inline-flex min-h-11 items-center border-b-2 px-1 font-semibold",
        active === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Saved" className="mt-6 flex gap-6 border-b border-mist">
      {tab("cars", "/account/saved", "Cars")}
      {tab("searches", "/account/saved/searches", "Searches")}
    </nav>
  );
}
