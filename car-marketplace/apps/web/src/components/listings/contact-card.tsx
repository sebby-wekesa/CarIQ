"use client";

import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatKenyanPhone } from "@cm/shared";
import { revealContact } from "@/lib/contact/actions";
import { signInHref, useBuyer } from "@/components/buyer/buyer-provider";
import { buttonClass } from "@/components/ui/button";

type Props = {
  listingId: string;
  sellerId: string | null;
  sellerFirstName: string;
  title: string;
  acceptsCalls: boolean;
  acceptsWhatsapp: boolean;
  appName: string;
  listingUrl: string;
};

/**
 * Message, call or WhatsApp the seller. Numbers are shown only to signed-in buyers, one car at
 * a time, and every reveal is logged as a lead for the seller's dashboard.
 */
export function ContactCard({ listingId, sellerId, sellerFirstName, title, acceptsCalls, acceptsWhatsapp, appName, listingUrl }: Props) {
  const { status, userId } = useBuyer();
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messageHref = `/messages/new?listing=${listingId}`;
  const here = new URL(listingUrl).pathname;

  if (status === "signedIn" && userId && userId === sellerId) {
    return (
      <p className="rounded-md bg-paper px-3 py-2.5 text-sm text-ink-soft">
        This is your listing. Buyers&apos; messages arrive in{" "}
        <Link href="/messages" className="font-semibold text-forest underline-offset-4 hover:underline">
          Messages
        </Link>
        .
      </p>
    );
  }

  function contact(kind: "call" | "whatsapp") {
    setError(null);
    // Only send people to sign in when we know they aren't; while the session is still loading,
    // the server action decides (and answers "sign in" if needed).
    if (status === "signedOut") {
      window.location.href = signInHref(here);
      return;
    }
    startTransition(async () => {
      const result = await revealContact(listingId, kind);
      if (!result.ok) {
        if (result.signIn) window.location.href = signInHref(here);
        else setError(result.message);
        return;
      }
      setPhone(result.phone);
      if (kind === "call") {
        window.location.href = `tel:${result.phone}`;
      } else {
        const text = `Hi ${sellerFirstName}, I saw your ${title} on ${appName} (${listingUrl}). Is it still available?`;
        window.location.href = `https://wa.me/${result.phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Link href={messageHref} className={buttonClass("primary", "md", "w-full")}>
        <MessageCircle aria-hidden className="size-5" />
        Message seller
      </Link>
      {acceptsCalls || acceptsWhatsapp ? (
        <div className="grid grid-cols-2 gap-2.5">
          {acceptsCalls ? (
            <button type="button" onClick={() => contact("call")} disabled={pending} className={buttonClass("secondary", "md", "w-full")}>
              <Phone aria-hidden className="size-4" />
              Call
            </button>
          ) : null}
          {acceptsWhatsapp ? (
            <button type="button" onClick={() => contact("whatsapp")} disabled={pending} className={buttonClass("secondary", "md", "w-full")}>
              <WhatsAppIcon />
              WhatsApp
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">This seller takes messages only.</p>
      )}
      {phone ? (
        <p className="text-sm">
          Seller&apos;s number:{" "}
          <a href={`tel:${phone}`} className="font-semibold text-forest underline-offset-4 hover:underline">
            {formatKenyanPhone(phone)}
          </a>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {status === "signedOut" ? <p className="text-xs text-muted">Sign in with your phone to see the seller&apos;s number.</p> : null}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M12.04 2a9.93 9.93 0 0 0-8.6 14.9L2 22l5.25-1.38A9.93 9.93 0 1 0 12.04 2Zm0 18.13c-1.5 0-2.96-.4-4.24-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 1 1 7.03 3.87Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42h-.48a.92.92 0 0 0-.66.31 2.78 2.78 0 0 0-.87 2.07 4.83 4.83 0 0 0 1.01 2.57 11.05 11.05 0 0 0 4.24 3.74c1.58.68 2.2.74 2.99.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}
