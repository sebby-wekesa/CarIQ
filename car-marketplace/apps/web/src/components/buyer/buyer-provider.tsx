"use client";

import { usePathname } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BuyerState } from "@/lib/buyer/state";

type Status = "loading" | "signedOut" | "signedIn";

type BuyerContextValue = {
  status: Status;
  userId: string | null;
  favourites: ReadonlySet<string>;
  savedSearches: ReadonlyMap<string, string>;
  unread: number;
  unreadMessages: number;
  reload: () => Promise<void>;
  /** Optimistic local update while a server action runs. */
  markFavourite: (listingId: string, saved: boolean) => void;
};

const BuyerContext = createContext<BuyerContextValue | null>(null);

/** Supabase keeps the session in "sb-<project>-auth-token" cookies; none means signed out. */
function hasSessionCookie() {
  return typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/.test(document.cookie);
}

/**
 * Loads the buyer's saved cars, saved searches and unread alerts once per visit, so public
 * pages stay fully cacheable and only this small request is personal. Re-checks when the
 * session cookie appears or disappears (sign-in and sign-out navigate without a reload).
 */
export function BuyerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(new Set());
  const [savedSearches, setSavedSearches] = useState<ReadonlyMap<string, string>>(new Map());
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const loadedFor = useRef<boolean | null>(null);

  const clear = useCallback(() => {
    setStatus("signedOut");
    setFavourites(new Set());
    setSavedSearches(new Map());
    setUnread(0);
    setUnreadMessages(0);
    setUserId(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = (await response.json()) as BuyerState;
      if (!state.signedIn) return clear();
      setFavourites(new Set(state.favourites));
      setSavedSearches(new Map(state.savedSearches.map((s) => [s.key, s.id])));
      setUnread(state.unread);
      setUnreadMessages(state.unreadMessages);
      setUserId(state.userId);
      setStatus("signedIn");
    } catch {
      // Hearts and badges are extras: if this fails, pages still work and buttons retry on click.
      setStatus((current) => (current === "loading" ? "signedOut" : current));
    }
  }, [clear]);

  const checkSession = useCallback(() => {
    const cookie = hasSessionCookie();
    if (loadedFor.current === cookie) return;
    loadedFor.current = cookie;
    if (cookie) void reload();
    else clear();
  }, [reload, clear]);

  // Messages and alerts arrive while a tab sits open: check once a minute while it's visible,
  // and straight away when someone comes back to it after a while.
  useEffect(() => {
    let last = Date.now();
    const refresh = (minimumGap: number) => {
      if (document.visibilityState !== "visible" || !hasSessionCookie() || Date.now() - last < minimumGap) return;
      last = Date.now();
      void reload();
    };
    const onVisible = () => refresh(30_000);
    const timer = setInterval(() => refresh(55_000), 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const markFavourite = useCallback((listingId: string, saved: boolean) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (saved) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ status, userId, favourites, savedSearches, unread, unreadMessages, reload, markFavourite }),
    [status, userId, favourites, savedSearches, unread, unreadMessages, reload, markFavourite],
  );
  return (
    <BuyerContext value={value}>
      {children}
      {/* The pathname is request-time data on dynamic routes, so it gets its own boundary. */}
      <Suspense fallback={null}>
        <SessionWatcher onNavigate={checkSession} />
      </Suspense>
    </BuyerContext>
  );
}

/** Sign-in and sign-out finish with a client-side navigation: re-check the session on each one. */
function SessionWatcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onNavigate();
  }, [pathname, onNavigate]);
  return null;
}

export function useBuyer(): BuyerContextValue {
  const value = useContext(BuyerContext);
  if (!value) throw new Error("useBuyer must be used inside <BuyerProvider>");
  return value;
}

/** Where to send a signed-out visitor so they come back to the same place. */
export function signInHref(returnTo: string) {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}
