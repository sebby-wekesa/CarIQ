import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { formatKesShort, listingPath } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { getConversation, getDealerColleagues } from "@/lib/messages/queries";
import { photoUrl } from "@/lib/storage";
import { ChatThread } from "@/components/chat/chat-thread";
import { SafetyNote } from "@/components/chat/safety-note";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 sm:px-6 sm:pt-8">
      <Suspense fallback={<div aria-hidden className="h-96 rounded-[var(--radius-control)] bg-mist/40" />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: Pick<PageProps<"/messages/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const data = await getConversation(id);
  if (!data) notFound();
  const { summary, messages } = data;
  const thumb = photoUrl(summary.cover_thumb_path);
  const otherName = summary.other_name ?? (summary.is_buyer ? "the seller" : "the buyer");
  // Buyers talk to the dealership by name; staff see which colleague answered.
  const firstName = summary.is_buyer && summary.dealer_name ? otherName : (otherName.split(/\s+/)[0] ?? otherName);
  const colleagues = !summary.is_buyer && summary.dealer_name && summary.listing_id ? await getDealerColleagues(summary.listing_id) : undefined;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-mist pb-3">
        <Link href="/messages" aria-label="All messages" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-mist/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- already a small thumbnail */}
          {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{otherName}</h1>
          <p className="truncate text-sm text-muted">
            {summary.is_buyer ? "Selling " : summary.dealer_name ? `Asking ${summary.dealer_name} about ` : "Asking about your "}
            {summary.listing_is_public && summary.listing_id ? (
              <Link href={listingPath(summary.listing_id, summary.listing_title)} className="font-semibold text-forest underline-offset-4 hover:underline">
                {summary.listing_title}
              </Link>
            ) : (
              <span className="font-semibold">{summary.listing_title}</span>
            )}
            {summary.listing_price_kes ? ` · ${formatKesShort(summary.listing_price_kes)}` : ""}
          </p>
        </div>
      </div>
      <SafetyNote className="mt-3" />
      <ChatThread
        key={id}
        conversationId={id}
        me={user.id}
        buyerId={summary.buyer_id ?? user.id}
        colleagues={colleagues}
        otherName={firstName}
        initialMessages={messages}
        listingOpen={Boolean(summary.listing_is_public)}
      />
    </>
  );
}
