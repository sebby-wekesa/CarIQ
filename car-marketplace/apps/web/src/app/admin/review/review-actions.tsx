"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { reviewListing, type ReviewState } from "./actions";

export function ReviewActions({ listingId }: { listingId: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(reviewListing.bind(null, listingId), {});
  const [rejecting, setRejecting] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {rejecting ? (
        <Field id={`reason-${listingId}`} label="What should the seller fix?" hint="The seller sees this message.">
          <Textarea
            id={`reason-${listingId}`}
            name="reason"
            rows={3}
            placeholder="The chassis number on the dashboard photo doesn't match the one entered."
            required
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {rejecting ? (
          <>
            <Button type="submit" name="decision" value="reject" pending={pending}>
              Send back to seller
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="approve" pending={pending}>
              Approve and publish
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
