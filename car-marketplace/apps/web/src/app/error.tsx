"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="display text-5xl">This page didn&apos;t load.</h1>
      <p className="mt-4 text-ink-soft">
        Check your connection and try again. If it keeps happening, quote reference{" "}
        <span className="font-semibold">{error.digest ?? "unknown"}</span> when you contact us.
      </p>
      <Button onClick={reset} className="mt-8">
        Try again
      </Button>
    </div>
  );
}
