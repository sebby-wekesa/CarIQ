import Link from "next/link";
import { cacheLife } from "next/cache";
import { env } from "@/lib/env";

export async function SiteFooter() {
  "use cache";
  cacheLife("days");

  return (
    <footer className="mt-auto bg-forest-deep text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-[1.4fr_0.8fr_1fr]">
        <div>
          <Link href="/" aria-label={`${env.appName} home`} className="inline-flex rounded-[var(--radius-plate)]">
            <span className="plate-type rounded-[var(--radius-plate)] bg-plate px-3 py-1.5 text-base text-ink">{env.appName}</span>
          </Link>
          <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-white/65">
            A clearer place to buy and sell cars in Kenya, built in Mombasa.
          </p>
        </div>

        <nav aria-label="Explore CarIQ" className="flex flex-col items-start gap-2 text-sm">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-white/45">Explore</h2>
          <Link href="/cars" className="site-footer-link">Browse cars</Link>
          <Link href="/dealers" className="site-footer-link">Verified dealers</Link>
          <Link href="/account/saved" className="site-footer-link">Saved cars</Link>
        </nav>

        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-white/45">Selling a car?</h2>
          <Link href="/sell" className="site-footer-link">List your car with CarIQ</Link>
          <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-white/65">
            Inspect the car, verify the logbook, then pay with confidence.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-white/45 sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {env.appName}. Built for Kenya.</p>
          <p>Browse carefully. Buy with confidence.</p>
        </div>
      </div>
    </footer>
  );
}
