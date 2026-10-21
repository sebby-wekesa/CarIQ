"use client";

import { clsx } from "clsx";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFavourite } from "@/lib/buyer/actions";
import { signInHref, useBuyer } from "./buyer-provider";

type Props = {
  listingId: string;
  title: string;
  /** "icon" sits on a card photo; "full" is a labelled button on the listing page. */
  variant?: "icon" | "full";
  /** Re-render the page after a change (the saved-cars list). */
  refreshOnChange?: boolean;
};

export function FavouriteButton({ listingId, title, variant = "icon", refreshOnChange }: Props) {
  const { status, favourites, markFavourite } = useBuyer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const saved = favourites.has(listingId);

  function toggle() {
    setMessage(null);
    const here = window.location.pathname + window.location.search;
    if (status === "signedOut") {
      router.push(signInHref(here));
      return;
    }
    const next = !saved;
    markFavourite(listingId, next);
    startTransition(async () => {
      const result = await setFavourite(listingId, next);
      if (!result.ok) {
        markFavourite(listingId, !next);
        if (result.signIn) router.push(signInHref(here));
        else setMessage(result.message);
        return;
      }
      if (refreshOnChange) router.refresh();
    });
  }

  const label = saved ? `Remove ${title} from saved cars` : `Save ${title}`;

  if (variant === "full") {
    return (
      <div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending || status === "loading"}
          aria-pressed={saved}
          className={clsx(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border px-4 font-semibold transition-colors disabled:opacity-60",
            saved ? "border-forest bg-forest/10 text-forest" : "border-ink/20 bg-surface text-ink hover:border-ink/40",
          )}
        >
          <Heart aria-hidden className={clsx("size-5", saved && "fill-current")} />
          {saved ? "Saved" : "Save this car"}
        </button>
        {message ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      title={message ?? (saved ? "Saved" : "Save")}
      className={clsx(
        "grid size-11 place-items-center rounded-full bg-surface/95 shadow-sm ring-1 ring-ink/10 transition-colors hover:bg-surface",
        saved ? "text-danger" : "text-ink",
      )}
    >
      <Heart aria-hidden className={clsx("size-5", saved && "fill-current")} />
    </button>
  );
}
