"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { CheckoutState } from "./actions";

type FormAction = (previous: CheckoutState, formData: FormData) => Promise<CheckoutState>;

export function ActionButton({ action, label }: { action: FormAction; label: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div>
      <form action={formAction}>
        <Button type="submit" pending={pending}>
          {label}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p role="status" className="mt-2 text-sm font-semibold text-success">{state.message}</p> : null}
    </div>
  );
}
