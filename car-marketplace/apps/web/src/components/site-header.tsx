import Link from "next/link";
import { Suspense } from "react";
import { UserRound } from "lucide-react";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { MessagesLink } from "@/components/buyer/messages-link";
import { SavedLink } from "@/components/buyer/saved-link";
import { PrimaryNavLinks } from "@/components/primary-nav-links";
import { PlateMark } from "@/components/plate-mark";
import { buttonClass } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-mist/80 bg-paper/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-1 px-3 sm:gap-4 sm:px-6">
        <Link href="/" aria-label={`${env.appName} home`} className="shrink-0 rounded-[var(--radius-plate)]">
          <span className="sm:hidden">
            <PlateMark name={env.appName} size="sm" />
          </span>
          <span className="hidden sm:block">
            <PlateMark name={env.appName} />
          </span>
        </Link>
        <nav aria-label="Main" className="flex shrink-0 items-center gap-0 sm:gap-1.5">
          <PrimaryNavLinks />
          <SavedLink />
          <MessagesLink />
          <Suspense fallback={<span className="block h-10 w-10 sm:h-11 sm:w-20" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={buttonClass("secondary", "md", "!h-10 !min-h-10 !w-10 !px-0 !text-sm sm:!h-11 sm:!w-auto sm:!px-4 sm:!text-base")}
      >
        <UserRound aria-hidden className="size-4 sm:hidden" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const label = user.fullName?.split(" ")[0] ?? "Your account";
  return (
    <Link href="/account" className="group flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-0.5 sm:min-h-11 sm:gap-2.5 sm:px-2">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-plate sm:size-9"
      >
        {initials(user.fullName) ?? "?"}
      </span>
      <span className="hidden font-semibold text-ink group-hover:underline group-hover:underline-offset-4 md:inline">{label}</span>
      <span className="sr-only md:hidden">{label}</span>
    </Link>
  );
}

function initials(name: string | null) {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || null;
}
