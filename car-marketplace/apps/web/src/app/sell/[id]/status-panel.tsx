"use client";

import { Check, Circle } from "lucide-react";
import { startTransition, useActionState, useTransition } from "react";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import type { Database } from "@cm/db";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { changeListingStatus, deleteDraft, type StatusState } from "../actions";

type Status = Database["public"]["Enums"]["listing_status"];
export type ChecklistItem = { label: string; done: boolean; href: string };

const DONE_MESSAGES: Record<string, string> = {
  submit: "Submitted. We'll check it and let you know.",
  withdraw: "Back to draft. Edit it and submit again when ready.",
  pause: "Paused. Buyers can't see it until you reactivate it.",
  reactivate: "Live again.",
  sold: "Marked as sold. Congratulations.",
  renew: "Sent for review to go live again.",
};

export function StatusPanel({
  listingId,
  status,
  checklist,
  rejectionReason,
}: {
  listingId: string;
  status: Status;
  checklist: ChecklistItem[];
  rejectionReason: string | null;
}) {
  const [state, action, pending] = useActionState<StatusState, FormData | null>(
    (previous, formData) => (formData ? changeListingStatus(listingId, previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));
  const [deleting, startDelete] = useTransition();
  const ready = checklist.every((item) => item.done);
  const canSubmit = status === "draft" || status === "rejected";

  return (
    <div className="mt-6 rounded-[var(--radius-control)] border border-mist bg-surface p-5">
      {state.error ? <Alert tone="error" className="mb-4">{state.error}</Alert> : null}
      {state.done && !state.error ? (
        <Alert tone="success" className="mb-4">
          {DONE_MESSAGES[state.done]}
        </Alert>
      ) : null}

      {status === "rejected" && rejectionReason ? (
        <Alert tone="error" className="mb-4">
          Not approved yet: {rejectionReason}
        </Alert>
      ) : null}

      {canSubmit ? (
        <>
          <p className="font-semibold">Before you submit</p>
          <ul className="mt-3 flex flex-col gap-2">
            {checklist.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="flex items-center gap-2.5 text-sm hover:underline hover:underline-offset-4">
                  {item.done ? (
                    <Check aria-hidden className="size-5 shrink-0 rounded-full bg-success p-0.5 text-white" />
                  ) : (
                    <Circle aria-hidden className="size-5 shrink-0 text-muted" />
                  )}
                  <span className={item.done ? "text-ink" : "text-ink-soft"}>
                    <span className="sr-only">{item.done ? "Done: " : "To do: "}</span>
                    {item.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink-soft">{STATUS_COPY[status]}</p>
      )}

      <form action={action} className="mt-5 flex flex-wrap gap-3">
        {canSubmit ? (
          <Button type="submit" name="intent" value="submit" size="lg" pending={pending} disabled={!ready}>
            Submit for review
          </Button>
        ) : null}
        {status === "pending_review" ? (
          <Button type="submit" name="intent" value="withdraw" variant="secondary" pending={pending}>
            Withdraw to edit
          </Button>
        ) : null}
        {status === "live" ? (
          <>
            <Button type="submit" name="intent" value="sold" pending={pending}>
              Mark as sold
            </Button>
            <Button type="submit" name="intent" value="pause" variant="secondary" disabled={pending}>
              Pause
            </Button>
          </>
        ) : null}
        {status === "paused" ? (
          <>
            <Button type="submit" name="intent" value="reactivate" pending={pending}>
              Reactivate
            </Button>
            <Button type="submit" name="intent" value="sold" variant="secondary" disabled={pending}>
              Mark as sold
            </Button>
          </>
        ) : null}
        {status === "expired" ? (
          <Button type="submit" name="intent" value="renew" pending={pending}>
            Renew listing
          </Button>
        ) : null}
        {status === "draft" ? (
          <Button
            type="button"
            variant="quiet"
            disabled={deleting}
            className="text-danger"
            onClick={() => {
              if (!window.confirm("Delete this draft and its photos? This can't be undone.")) return;
              startDelete(async () => {
                const result = await deleteDraft(listingId);
                if (result?.error) window.alert(result.error);
              });
            }}
          >
            Delete draft
          </Button>
        ) : null}
      </form>
      {canSubmit && !ready ? (
        <p className="mt-2 text-sm text-muted">Finish the steps above to submit.</p>
      ) : null}
    </div>
  );
}

const STATUS_COPY: Record<Status, string> = {
  draft: "",
  rejected: "",
  pending_review: "We're checking your listing. It goes live as soon as it's approved, usually within a day.",
  live: "Your car is on sale. Edits to price and details show straight away.",
  paused: "Paused: buyers can't see this listing.",
  sold: "Sold. The listing stays in your history and the car's Passport.",
  expired: "This listing expired after 60 days. Renew it to put it back on sale.",
};
