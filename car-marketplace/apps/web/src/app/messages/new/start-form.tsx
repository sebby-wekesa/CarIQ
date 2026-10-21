"use client";

import { useActionState, useState } from "react";
import { startConversation, type StartState } from "@/lib/messages/actions";
import { MAX_MESSAGE_LENGTH, QUICK_REPLIES } from "@/lib/messages/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";

export function StartForm({ listingId, sellerName }: { listingId: string; sellerName: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startConversation, {});
  const [body, setBody] = useState(state.body ?? "");

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="listingId" value={listingId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div>
        <p className="text-sm font-semibold">Quick start</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {QUICK_REPLIES.map((reply) => (
            <li key={reply}>
              <button
                type="button"
                onClick={() => setBody(reply)}
                aria-pressed={body === reply}
                className="inline-flex min-h-10 items-center rounded-full border border-mist bg-surface px-3.5 text-left text-sm font-medium hover:border-ink/30 aria-pressed:border-forest aria-pressed:bg-forest aria-pressed:text-white"
              >
                {reply}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Field id="body" label="Your message" hint={`${sellerName} gets a text message if they don't see it in the app.`}>
        <Textarea id="body" name="body" required maxLength={MAX_MESSAGE_LENGTH} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" pending={pending} disabled={!body.trim()}>
        Send message
      </Button>
    </form>
  );
}
