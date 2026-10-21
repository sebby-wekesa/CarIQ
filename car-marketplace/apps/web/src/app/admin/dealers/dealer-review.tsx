"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { reviewDealer, setDealerTrust, type DealerReviewState } from "./actions";

export function DealerReview({ dealerId, name }: { dealerId: string; name: string }) {
  const [state, action, pending] = useActionState<DealerReviewState, FormData>(reviewDealer.bind(null, dealerId), {});
  const [rejecting, setRejecting] = useState(false);
  if (state.done) return <Alert tone="success">{state.done}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {rejecting ? (
        <Field id={`reason-${dealerId}`} label="What should the dealer fix?" hint="Sent to the owner by SMS and shown on their dashboard.">
          <Textarea id={`reason-${dealerId}`} name="reason" rows={3} required placeholder="The KRA PIN certificate is for a different business name." />
        </Field>
      ) : (
        <Checkbox
          name="trusted"
          label="Publish their cars without review"
          hint="For established dealers. Cars with a Passport flag still come to the review queue."
        />
      )}
      <div className="flex flex-wrap gap-3">
        {rejecting ? (
          <>
            <Button type="submit" name="decision" value="reject" pending={pending}>
              Send back to dealer
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="approve" pending={pending} aria-label={`Approve ${name}`}>
              Approve dealer
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
              Reject
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

export function TrustToggle({ dealerId, trusted }: { dealerId: string; trusted: boolean }) {
  const [message, setMessage] = useState<DealerReviewState>({});
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {message.error ? <Alert tone="error">{message.error}</Alert> : null}
      {message.done ? <Alert tone="success">{message.done}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        pending={busy}
        className="self-start"
        onClick={() => start(async () => setMessage(await setDealerTrust(dealerId, !trusted)))}
      >
        {trusted ? "Stop publishing without review" : "Publish their cars without review"}
      </Button>
    </div>
  );
}
