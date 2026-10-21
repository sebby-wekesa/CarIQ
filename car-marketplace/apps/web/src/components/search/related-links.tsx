import Link from "next/link";
import type { Section } from "@/lib/search/related";

const nf = new Intl.NumberFormat("en-KE");

export function RelatedLinks({ sections }: { sections: Section[] }) {
  if (!sections.length) return null;
  return (
    <div className="mt-14 grid gap-8 border-t border-mist pt-10 md:grid-cols-2">
      {sections.map((section) => (
        <section key={section.heading} aria-label={section.heading}>
          <h2 className="font-semibold">{section.heading}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-mist bg-surface px-3.5 text-sm font-medium hover:border-ink/30"
                >
                  {link.label}
                  <span className="text-muted">{nf.format(link.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
