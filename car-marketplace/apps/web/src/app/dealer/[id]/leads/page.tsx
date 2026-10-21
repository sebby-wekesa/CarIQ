import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { clsx } from "clsx";
import { MessageSquare, Phone } from "lucide-react";
import { listingPath } from "@cm/shared";
import { getDealerLeads, requireDealer } from "@/lib/dealers/queries";
import { formatDateTime } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { LEAD_LABEL } from "../../lead-labels";

export const metadata: Metadata = { title: "Leads", robots: { index: false } };

const TYPES = ["all", "chat", "call", "whatsapp"] as const;

export default function LeadsPage({ params, searchParams }: PageProps<"/dealer/[id]/leads">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Leads params={params} searchParams={searchParams} />
      </Suspense>
    </DealerFrame>
  );
}

async function Leads({ params, searchParams }: Pick<PageProps<"/dealer/[id]/leads">, "params" | "searchParams">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/leads`);
  const wanted = (await searchParams).type;
  const type = TYPES.find((t) => t === wanted) ?? "all";
  const leads = dealer.status === "approved" ? await getDealerLeads(id, 500) : [];
  const shown = type === "all" ? leads : leads.filter((l) => l.lead_type === type);

  return (
    <>
      <DealerHeader dealer={dealer} tab="leads" />
      <div className="mt-6 flex flex-col gap-5">
        <p className="text-ink-soft">
          Every chat, call and WhatsApp tap on your cars. Calls and WhatsApp go to the showroom phone; chats are answered
          here by anyone on the team.
        </p>
        <nav aria-label="Filter leads">
          <ul className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <li key={t}>
                <Link
                  href={t === "all" ? `/dealer/${id}/leads` : `/dealer/${id}/leads?type=${t}`}
                  aria-current={type === t ? "page" : undefined}
                  className={clsx(
                    "inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold",
                    type === t ? "border-forest bg-forest text-white" : "border-mist bg-surface hover:border-ink/30",
                  )}
                >
                  {t === "all" ? "All" : LEAD_LABEL[t]}{" "}
                  <span className={clsx("ml-1.5", type === t ? "text-white/80" : "text-muted")}>
                    {t === "all" ? leads.length : leads.filter((l) => l.lead_type === t).length}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {shown.length === 0 ? (
          <p className="text-muted">No leads yet. They appear here when buyers get in touch about your cars.</p>
        ) : (
          <ul className="divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface" aria-label="Leads">
            {shown.map((l, i) => (
              <li key={`${l.created_at}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  {l.lead_type === "chat" ? (
                    <MessageSquare aria-hidden className="mt-1 size-5 shrink-0 text-forest" />
                  ) : (
                    <Phone aria-hidden className="mt-1 size-5 shrink-0 text-forest" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      <Link href={listingPath(l.listing_id, l.listing_title)} className="underline-offset-4 hover:underline">
                        {l.listing_title}
                      </Link>
                    </p>
                    <p className="text-sm text-muted">
                      {LEAD_LABEL[l.lead_type]} from {l.buyer_name ?? "a buyer"} · {formatDateTime(l.created_at)}
                    </p>
                  </div>
                </div>
                {l.conversation_id ? (
                  <Link href={`/messages/${l.conversation_id}`} className={buttonClass(l.unread ? "primary" : "secondary")}>
                    {l.unread ? `Reply (${l.unread} unread)` : "Open chat"}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
