"use client";

import { useEffect } from "react";

/**
 * Counts a view for the seller's dashboard. Sent once the page has actually been shown (not on
 * prefetch), without holding anything up; the server counts each visitor once a day.
 */
export function ViewBeacon({ listingId }: { listingId: string }) {
  useEffect(() => {
    const url = `/api/listings/${listingId}/view`;
    const timer = setTimeout(() => {
      try {
        if (navigator.sendBeacon?.(url)) return;
      } catch {
        // fall through to fetch
      }
      void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [listingId]);
  return null;
}
