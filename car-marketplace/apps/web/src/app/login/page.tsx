import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <h1 className="display text-4xl sm:text-5xl">Sign in with your phone</h1>
      <p className="mt-3 text-ink-soft">New here? The same steps create your account.</p>
      <div className="mt-8">
        <Suspense fallback={<FormPlaceholder />}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(Array.isArray(next) ? next[0] : next)} />;
}

function FormPlaceholder() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="h-4 w-28 rounded bg-mist" />
      <div className="h-12 rounded-[var(--radius-control)] bg-mist/60" />
      <div className="h-13 rounded-[var(--radius-control)] bg-mist" />
    </div>
  );
}
