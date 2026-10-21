"use client";

import { clsx } from "clsx";
import { AlertTriangle, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { markConversationRead, sendMessage } from "@/lib/messages/actions";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/messages/types";
import { dayLabel, formatTime } from "@/lib/format";
import { useBuyer } from "@/components/buyer/buyer-provider";

type Props = {
  conversationId: string;
  me: string;
  /** The buyer in this chat. Everyone else writes for the seller's side (a dealer's whole team). */
  buyerId: string;
  /** First names of colleagues on the seller's side, shown on their messages. */
  colleagues?: Record<string, string>;
  otherName: string;
  initialMessages: ChatMessage[];
  /** False once the car is sold or withdrawn: the chat stays readable but says so. */
  listingOpen: boolean;
};

type Pending = { key: string; body: string; failed?: string };

const POLL_VISIBLE = 4_000;
const POLL_HIDDEN = 30_000;

export function ChatThread({ conversationId, me, buyerId, colleagues, otherName, initialMessages, listingOpen }: Props) {
  const { reload } = useBuyer();
  // "Mine" means my side of the chat: for a dealer, a colleague's reply is ours too.
  const isMine = useCallback((m: Pick<ChatMessage, "sender_id">) => (me === buyerId ? m.sender_id === me : m.sender_id !== buyerId), [me, buyerId]);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [, startSend] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const latest = useRef(initialMessages.at(-1)?.created_at ?? null);
  const readPending = useRef(false);

  const merge = useCallback((incoming: ChatMessage[], readUpTo?: string | null) => {
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      let next = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (readUpTo) {
        next = next.map((m) => (isMine(m) && !m.read_at && m.created_at <= readUpTo ? { ...m, read_at: readUpTo } : m));
      }
      latest.current = next.at(-1)?.created_at ?? latest.current;
      return next;
    });
  }, [isMine]);

  // Mark the other person's messages read while they're on screen.
  const markRead = useCallback(async () => {
    if (readPending.current || document.visibilityState !== "visible") return;
    readPending.current = true;
    try {
      const changed = await markConversationRead(conversationId);
      if (changed > 0) {
        const now = new Date().toISOString();
        setMessages((current) => current.map((m) => (!isMine(m) && !m.read_at ? { ...m, read_at: now } : m)));
        void reload();
      }
    } finally {
      readPending.current = false;
    }
  }, [conversationId, isMine, reload]);

  const unreadFromThem = messages.some((m) => !isMine(m) && !m.read_at);
  useEffect(() => {
    if (unreadFromThem) void markRead();
  }, [unreadFromThem, markRead]);

  // Poll for new messages and read receipts: quickly while the tab is visible, slowly otherwise.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      try {
        const after = latest.current ? `?after=${encodeURIComponent(latest.current)}` : "";
        const response = await fetch(`/api/conversations/${conversationId}/messages${after}`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as { messages: ChatMessage[]; readUpTo: string | null };
          merge(data.messages, data.readUpTo);
        }
      } catch {
        // Offline for a moment: the next tick tries again.
      }
      if (!stopped) timer = setTimeout(tick, document.visibilityState === "visible" ? POLL_VISIBLE : POLL_HIDDEN);
    };
    timer = setTimeout(tick, POLL_VISIBLE);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, merge]);

  // Keep the newest message in view.
  const count = messages.length + pending.length;
  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  function send(body: string, key = crypto.randomUUID()) {
    const text = body.trim();
    if (!text) return;
    setPending((p) => [...p.filter((x) => x.key !== key), { key, body: text }]);
    startSend(async () => {
      const result = await sendMessage(conversationId, text);
      if (result.ok) {
        merge([result.message]);
        setPending((p) => p.filter((x) => x.key !== key));
      } else {
        setPending((p) => p.map((x) => (x.key === key ? { ...x, failed: result.error } : x)));
      }
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(draft);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a keyboard; phones keep Enter for new lines and use the button.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
      event.preventDefault();
      submit(event);
    }
  }

  const lastMineId = [...messages].reverse().find(isMine)?.id;

  return (
    <div className="flex flex-col">
      <ol ref={list} className="flex flex-col gap-1.5 py-4" aria-label={`Messages with ${otherName}`} aria-live="polite">
        {messages.length === 0 && pending.length === 0 ? (
          <li className="py-10 text-center text-muted">No messages yet.</li>
        ) : null}
        {messages.map((m, i) => {
          const mine = isMine(m);
          const colleague = mine && m.sender_id !== me ? (colleagues?.[m.sender_id] ?? "A colleague") : null;
          const day = dayLabel(m.created_at);
          const newDay = i === 0 || dayLabel(messages[i - 1]!.created_at) !== day;
          return (
            <li key={m.id} className="flex flex-col">
              {newDay ? (
                <p className="my-3 self-center rounded-full bg-mist/60 px-3 py-0.5 text-xs font-semibold text-ink-soft">{day}</p>
              ) : null}
              <div className={clsx("flex max-w-[85%] flex-col", mine ? "items-end self-end" : "items-start self-start")}>
                <p
                  className={clsx(
                    "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 leading-snug",
                    mine ? "rounded-br-md bg-forest text-white" : "rounded-bl-md border border-mist bg-surface text-ink",
                  )}
                >
                  <span className="sr-only">{colleague ?? (mine ? "You" : otherName)}: </span>
                  {m.body}
                </p>
                <p className="mt-0.5 px-1 text-xs text-muted">
                  {colleague ? <span aria-hidden className="mr-1.5 font-semibold text-ink-soft">{colleague}</span> : null}
                  {formatTime(m.created_at)}
                  {mine && m.id === lastMineId ? <span className="ml-1.5">{m.read_at ? "· Seen" : "· Sent"}</span> : null}
                </p>
                {!mine && m.flags.includes("payment") ? (
                  <p role="note" className="mt-1 flex gap-2 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>
                      This message mentions paying. Don&apos;t send money before you have seen the car and checked its
                      logbook. Real sellers don&apos;t need a deposit to hold a car.
                    </span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.key} className="flex max-w-[85%] flex-col items-end self-end">
            <p className={clsx("whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2", p.failed ? "bg-danger-soft text-danger" : "bg-forest/70 text-white")}>
              {p.body}
            </p>
            <p className="mt-0.5 px-1 text-xs text-muted">
              {p.failed ? (
                <>
                  {p.failed}{" "}
                  <button type="button" onClick={() => send(p.body, p.key)} className="font-semibold text-forest underline underline-offset-2">
                    Try again
                  </button>
                </>
              ) : (
                "Sending…"
              )}
            </p>
          </li>
        ))}
      </ol>
      <div ref={bottom} />

      <form onSubmit={submit} className="sticky bottom-0 -mx-4 border-t border-mist bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-[var(--radius-control)] sm:px-0">
        {!listingOpen ? <p className="mb-2 text-sm text-muted">This car is no longer listed. You can still message each other.</p> : null}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Message {otherName}
          </label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={`Message ${otherName}`}
            className="field-sizing-content block max-h-40 min-h-12 w-full resize-none rounded-[var(--radius-control)] border border-mist bg-surface px-3.5 py-3 text-base text-ink placeholder:text-muted/70 focus-visible:border-forest focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-forest/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-control)] bg-forest text-white hover:bg-forest-deep disabled:opacity-40"
          >
            <SendHorizontal aria-hidden className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
