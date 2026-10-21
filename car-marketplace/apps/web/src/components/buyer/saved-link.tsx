"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useBuyer } from "./buyer-provider";

/** Header link to saved cars and searches, with the number of unread search alerts. */
export function SavedLink() {
  const { unread } = useBuyer();
  const href = unread > 0 ? "/account/saved/searches" : "/account/saved";
  return (
    <Link
      href={href}
      className="relative flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-1.5 font-semibold text-ink hover:bg-paper sm:min-h-11 sm:px-2.5"
      aria-label={unread > 0 ? `Saved, ${unread} new ${unread === 1 ? "alert" : "alerts"}` : "Saved"}
    >
      <Heart aria-hidden className="size-5" />
      <span className="hidden md:inline">Saved</span>
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute right-0.5 top-1 grid h-5 md:static md:ml-0.5 min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
