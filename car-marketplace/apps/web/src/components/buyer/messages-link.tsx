"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useBuyer } from "./buyer-provider";

/** Header link to chats, with the number of unread messages. Hidden until signed in. */
export function MessagesLink() {
  const { status, unreadMessages } = useBuyer();
  if (status !== "signedIn") return null;
  return (
    <Link
      href="/messages"
      className="relative flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-1.5 font-semibold text-ink hover:bg-paper sm:min-h-11 sm:px-2.5"
      aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}
    >
      <MessageCircle aria-hidden className="size-5" />
      <span className="hidden md:inline">Messages</span>
      {unreadMessages > 0 ? (
        <span aria-hidden className="absolute right-0.5 top-1 grid h-5 md:static md:ml-0.5 min-w-5 place-items-center rounded-full bg-forest px-1 text-xs font-bold text-white">
          {unreadMessages > 9 ? "9+" : unreadMessages}
        </span>
      ) : null}
    </Link>
  );
}
