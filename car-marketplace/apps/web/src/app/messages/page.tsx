import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { clsx } from "clsx";
import { requireUser } from "@/lib/auth";
import { shortWhen } from "@/lib/format";
import { getMyConversations } from "@/lib/messages/queries";
import { photoUrl } from "@/lib/storage";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default function MessagesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Messages</h1>
      <Suspense fallback={<div aria-hidden className="mt-8 h-64 rounded-[var(--radius-control)] bg-mist/40" />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  await requireUser("/messages");
  const conversations = await getMyConversations();
  if (conversations === null) {
    return (
      <p role="alert" className="mt-8 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-danger">
        We can&apos;t load your messages right now. Try again in a minute.
      </p>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="mt-8 rounded-[var(--radius-control)] border-2 border-dashed border-mist p-6 sm:p-8">
        <p className="text-xl font-semibold">No messages yet.</p>
        <p className="mt-1 max-w-[52ch] text-muted">
          Found a car you like? Tap “Message seller” on its page. Buyers&apos; questions about your cars arrive here too.
        </p>
        <ButtonLink href="/cars" className="mt-5">
          Browse cars
        </ButtonLink>
      </div>
    );
  }

  return (
    <ul className="mt-8 flex flex-col divide-y divide-mist overflow-hidden rounded-[var(--radius-control)] border border-mist bg-surface">
      {conversations.map((c) => {
        const thumb = photoUrl(c.cover_thumb_path);
        const unread = Number(c.unread ?? 0);
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className="flex gap-3 px-4 py-3.5 hover:bg-paper">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-mist/50">
                {/* eslint-disable-next-line @next/next/no-img-element -- already a small thumbnail */}
                {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={clsx("truncate", unread ? "font-bold" : "font-semibold")}>{c.other_name ?? "Someone"}</p>
                  <p className="shrink-0 text-xs text-muted">{c.last_message_at ? shortWhen(c.last_message_at) : ""}</p>
                </div>
                <p className="truncate text-sm text-ink-soft">
                  <span className="text-muted">{c.is_buyer ? "Buying" : c.dealer_name ? c.dealer_name : "Selling"} · </span>
                  {c.listing_title}
                  {!c.listing_is_public ? <span className="text-muted"> · {c.listing_status === "sold" ? "sold" : "not listed"}</span> : null}
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-3">
                  <p className={clsx("truncate text-sm", unread ? "font-semibold text-ink" : "text-muted")}>
                    {c.last_from_me ? (!c.is_buyer && c.dealer_name ? "Replied: " : "You: ") : ""}
                    {c.last_body}
                  </p>
                  {unread ? (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-forest px-1.5 text-xs font-bold text-white">
                      <span className="sr-only">Unread: </span>
                      {unread}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
