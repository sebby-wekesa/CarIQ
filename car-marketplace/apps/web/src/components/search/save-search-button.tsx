"use client";

import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SearchFilters } from "@cm/shared";
import { saveSearch } from "@/lib/buyer/actions";
import { filtersKey } from "@/lib/buyer/state";
import { signInHref, useBuyer } from "@/components/buyer/buyer-provider";
import { Button, buttonClass } from "@/components/ui/button";

type Props = {
  filters: SearchFilters;
  /** The clean URL of this search, to come back to after signing in. */
  href: string;
  /** True when the visitor signed in from this button: save without a second tap. */
  autoSave?: boolean;
};

/** "Save search": the buyer hears about new matches instead of checking back every day. */
export function SaveSearchButton({ filters, href, autoSave }: Props) {
  const { status, savedSearches, reload } = useBuyer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const savedId = savedSearches.get(filtersKey(filters));
  const autoSaved = useRef(false);

  async function handle(result: Awaited<ReturnType<typeof saveSearch>>) {
    if (!result.ok) {
      if (result.signIn) router.push(signInHref(withSaveFlag(href)));
      else setMessage({ tone: "error", text: result.message });
      return;
    }
    await reload();
    setMessage({ tone: "ok", text: "Saved. We'll let you know when new cars match." });
  }

  function save() {
    setMessage(null);
    startTransition(async () => handle(await saveSearch(filters)));
  }

  // Back from signing in with ?save=1: finish the job, then tidy the URL.
  useEffect(() => {
    if (!autoSave || autoSaved.current || status !== "signedIn") return;
    autoSaved.current = true;
    router.replace(href, { scroll: false });
    if (!savedId) void saveSearch(filters).then(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, as soon as the session is known
  }, [autoSave, status]);

  if (status === "signedOut") {
    return (
      <Link href={signInHref(withSaveFlag(href))} className={buttonClass("secondary")}>
        <Bell aria-hidden className="size-4" />
        Save search
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {savedId ? (
        <Link
          href="/account/saved/searches"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-forest bg-forest/5 px-4 font-semibold text-forest hover:bg-forest/10"
        >
          <BellRing aria-hidden className="size-4" />
          Search saved
        </Link>
      ) : (
        <Button type="button" variant="secondary" onClick={save} pending={pending} disabled={status === "loading"}>
          {pending ? null : <Bell aria-hidden className="size-4" />}
          Save search
        </Button>
      )}
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm font-medium text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function withSaveFlag(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}save=1`;
}
