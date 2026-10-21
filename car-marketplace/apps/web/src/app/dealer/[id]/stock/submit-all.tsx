"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitReadyStock } from "../../actions";

export function SubmitAll({ dealerId, ready, drafts, trusted }: { dealerId: string; ready: number; drafts: number; trusted: boolean }) {
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-mist bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">
          {ready} of {drafts} {drafts === 1 ? "draft is" : "drafts are"} ready
        </p>
        <p className="text-sm text-muted">
          {trusted ? "Ready cars go live straight away." : "Ready cars go to our review team, usually live within a few hours."}
        </p>
        {message ? (
          <Alert tone={message.tone} className="mt-2">
            {message.text}
          </Alert>
        ) : null}
      </div>
      <Button
        type="button"
        disabled={!ready}
        pending={busy}
        onClick={() =>
          start(async () => {
            const result = await submitReadyStock(dealerId);
            setMessage(result.errors?._form ? { tone: "error", text: result.errors._form } : { tone: "success", text: result.message ?? "Done." });
          })
        }
      >
        {trusted ? `Publish ${ready} ready` : `Submit ${ready} for review`}
      </Button>
    </div>
  );
}
