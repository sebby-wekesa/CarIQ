import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false },
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <Suspense fallback={<AccountPlaceholder />}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const params = await searchParams;
  const user = await requireUser("/account");
  const welcome = params.welcome === "1";
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <>
      <h1 className="display text-4xl sm:text-5xl">{welcome ? "You're in. Who's selling?" : "Your profile"}</h1>
      <p className="mt-3 text-ink-soft">
        {welcome
          ? "Add your name and county. Buyers see them on your listings before they contact you."
          : "Your name and county appear on your listings."}
      </p>
      <div className="mt-8">
        <ProfileForm
          key={user.id}
          phone={user.phone}
          defaults={{ fullName: user.fullName ?? "", countyCode: user.countyCode ? String(user.countyCode) : "" }}
          next={welcome ? safeNext(nextParam) : null}
        />
      </div>
      {welcome ? null : (
        <nav aria-label="Your account" className="mt-10 grid gap-3 sm:grid-cols-2">
          {[
            ["/messages", "Messages"],
            ["/account/saved", "Saved cars"],
            ["/account/saved/searches", "Saved searches"],
            ["/account/orders", "Orders and receipts"],
            ["/sell", "Your listings"],
            ["/account/notifications", "Notifications"],
            ["/dealer", "Dealer dashboard"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              className="flex min-h-12 items-center rounded-[var(--radius-control)] border border-mist bg-surface px-4 font-semibold hover:border-ink/30"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <form action={signOut} className="mt-12 border-t border-mist pt-6">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </>
  );
}

function AccountPlaceholder() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="h-12 w-2/3 rounded bg-mist" />
      <div className="h-4 w-1/2 rounded bg-mist/70" />
      <div className="mt-6 h-12 rounded-[var(--radius-control)] bg-mist/60" />
      <div className="h-12 rounded-[var(--radius-control)] bg-mist/60" />
    </div>
  );
}
