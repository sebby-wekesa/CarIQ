"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { finishMockCheckout, type MockCheckoutState } from "./actions";

export function MockCheckoutControls({ providerRef, returnTo }: { providerRef: string; returnTo: string }) {
  const [state, formAction, pending] = useActionState(finishMockCheckout.bind(null, providerRef, returnTo), {} as MockCheckoutState);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3 sm:flex-row">
      <Button type="submit" name="outcome" value="succeeded" pending={pending}>
        Complete test payment
      </Button>
      <Button type="submit" name="outcome" value="cancelled" variant="secondary" disabled={pending}>
        Cancel checkout
      </Button>
      {state.error ? (
        <p role="alert" className="basis-full text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
