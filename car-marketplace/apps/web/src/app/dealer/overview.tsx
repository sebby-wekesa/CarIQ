import Link from "next/link";
import { FileSpreadsheet, ImagePlus, Plus } from "lucide-react";
import { DEALER_DOCUMENT_KINDS } from "@cm/shared";
import { canManage, countRecentLeads, getDealerLeads, getDealerStock, type MyDealer } from "@/lib/dealers/queries";
import { shortWhen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { DealerHeader } from "./dealer-header";
import { DealerDocuments, type DealerDocument } from "./documents";
import { LEAD_LABEL } from "./lead-labels";

const DOC_LABEL = Object.fromEntries(DEALER_DOCUMENT_KINDS.map((d) => [d.kind, d.label.toLowerCase()]));

export async function DealerOverview({ dealer, welcome }: { dealer: MyDealer; welcome: boolean }) {
  return (
    <>
      <DealerHeader dealer={dealer} tab="overview" />
      <div className="mt-8">{dealer.status === "approved" ? <Approved dealer={dealer} /> : <Application dealer={dealer} welcome={welcome} />}</div>
    </>
  );
}

async function Application({ dealer, welcome }: { dealer: MyDealer; welcome: boolean }) {
  const manager = canManage(dealer.role);
  const missing = dealer.missing_documents ?? [];
  let documents: DealerDocument[] = [];
  if (manager) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("dealer_documents")
      .select("id, kind, content_type, created_at")
      .eq("dealer_id", dealer.id)
      .order("created_at", { ascending: false });
    documents = data ?? [];
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {welcome ? <Alert tone="success">Application saved. Now upload your documents so we can verify the business.</Alert> : null}
      {dealer.status === "rejected" ? (
        <Alert tone="error">
          <p className="font-semibold">We couldn&apos;t approve the application yet.</p>
          {dealer.rejection_reason ? <p className="mt-1">{dealer.rejection_reason}</p> : null}
        </Alert>
      ) : dealer.status === "suspended" ? (
        <Alert tone="error">This dealership is suspended. Contact support.</Alert>
      ) : missing.length ? (
        <Alert tone="info">
          Upload the {missing.map((k) => DOC_LABEL[k] ?? k).join(", ")} so we can review your application.
        </Alert>
      ) : (
        <Alert tone="info">
          We&apos;re checking your documents, usually within one working day. We&apos;ll text the owner when it&apos;s done.
        </Alert>
      )}

      {manager ? (
        <section aria-labelledby="documents-heading">
          <h2 id="documents-heading" className="text-xl font-bold">
            Verification documents
          </h2>
          <p className="mt-1 text-sm text-muted">PDF or a clear photo, up to 10 MB each. Only our review team can open them.</p>
          <div className="mt-4">
            <DealerDocuments dealerId={dealer.id} documents={documents} canResubmit={dealer.status === "rejected"} />
          </div>
        </section>
      ) : (
        <p className="text-ink-soft">The owner or a manager uploads the documents. You&apos;ll be able to add cars once we approve the dealership.</p>
      )}

      <section className="rounded-[var(--radius-control)] border border-mist bg-surface p-4">
        <h2 className="font-semibold">While you wait</h2>
        <ul className="mt-2 list-disc pl-5 text-ink-soft">
          <li>
            <Link href={`/dealer/${dealer.id}/team`} className="font-semibold text-forest underline-offset-4 hover:underline">
              Add your sales team
            </Link>{" "}
            so they can answer buyers from day one.
          </li>
          <li>
            Get your stock list ready.{" "}
            <a href="/dealer/stock-template.csv" download className="font-semibold text-forest underline-offset-4 hover:underline">
              Download the spreadsheet template
            </a>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}

async function Approved({ dealer }: { dealer: MyDealer }) {
  const [stock, leads] = await Promise.all([getDealerStock(dealer.id), getDealerLeads(dealer.id, 200)]);
  const live = stock.filter((s) => s.status === "live").length;
  const drafts = stock.filter((s) => s.status === "draft");
  const ready = drafts.filter((s) => (s.missing ?? []).length === 0).length;
  const inReview = stock.filter((s) => s.status === "pending_review").length;
  const leadsWeek = countRecentLeads(leads, 7);
  const views = stock.reduce((sum, s) => sum + Number(s.views_7d ?? 0), 0);
  const unread = stock.reduce((sum, s) => sum + Number(s.unread_messages ?? 0), 0);

  const tiles = [
    { label: "Live cars", value: live, href: `/dealer/${dealer.id}/stock?status=live` },
    { label: "Drafts", value: drafts.length, note: drafts.length ? `${ready} ready to submit` : undefined, href: `/dealer/${dealer.id}/stock?status=draft` },
    { label: "Views, 7 days", value: views, href: `/dealer/${dealer.id}/stock` },
    { label: "Leads, 7 days", value: leadsWeek, note: unread ? `${unread} unread messages` : undefined, href: `/dealer/${dealer.id}/leads` },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="flex h-full flex-col rounded-[var(--radius-control)] border border-mist bg-surface p-4 hover:border-ink/30">
              <span className="text-sm font-semibold text-muted">{t.label}</span>
              <span className="display mt-1 text-4xl">{t.value.toLocaleString("en-KE")}</span>
              {t.note ? <span className="mt-1 text-sm font-semibold text-forest">{t.note}</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-ink-soft">
        {dealer.trusted
          ? "Your cars go live as soon as you submit them, unless the Vehicle Passport needs a closer look."
          : `We check each car before it goes live, usually within a few hours.${inReview ? ` ${inReview} waiting now.` : ""}`}
      </p>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/dealer/${dealer.id}/upload`} size="lg">
          <FileSpreadsheet aria-hidden className="size-5" />
          Upload a spreadsheet
        </ButtonLink>
        <ButtonLink href={`/dealer/${dealer.id}/photos`} variant="secondary" size="lg">
          <ImagePlus aria-hidden className="size-5" />
          Add photos
        </ButtonLink>
        <ButtonLink href={`/sell/new?dealer=${dealer.id}`} variant="secondary" size="lg">
          <Plus aria-hidden className="size-5" />
          Add one car
        </ButtonLink>
      </div>

      <section aria-labelledby="recent-leads">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-leads" className="text-xl font-bold">
            Latest leads
          </h2>
          <Link href={`/dealer/${dealer.id}/leads`} className={buttonClass("quiet")}>
            All leads
          </Link>
        </div>
        {leads.length === 0 ? (
          <p className="mt-3 text-muted">No leads yet. They appear here when buyers chat, call or WhatsApp about your cars.</p>
        ) : (
          <ul className="mt-3 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
            {leads.slice(0, 5).map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.listing_title}</p>
                  <p className="text-sm text-muted">
                    {LEAD_LABEL[l.lead_type]} from {l.buyer_name ?? "a buyer"} · {shortWhen(l.created_at)}
                  </p>
                </div>
                {l.conversation_id ? (
                  <Link href={`/messages/${l.conversation_id}`} className={buttonClass("secondary")}>
                    Reply
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
