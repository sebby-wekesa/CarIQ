"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { MAX_MESSAGE_LENGTH, MESSAGE_COLUMNS, type ChatMessage } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanBody(raw: unknown): string | { error: string } {
  const body = String(raw ?? "").trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > MAX_MESSAGE_LENGTH) return { error: `Keep it under ${MAX_MESSAGE_LENGTH} characters.` };
  return body;
}

export type StartState = { error?: string; body?: string };

/** First message about a car: opens the conversation (or reuses one) and sends it. */
export async function startConversation(_previous: StartState, formData: FormData): Promise<StartState> {
  const listingId = String(formData.get("listingId") ?? "");
  await requireUser(`/messages/new?listing=${encodeURIComponent(listingId)}`);
  if (!UUID.test(listingId)) return { error: "That car wasn't found." };
  const body = cleanBody(formData.get("body"));
  if (typeof body !== "string") return { ...body, body: String(formData.get("body") ?? "") };

  const supabase = await createClient();
  let conversationId: string | null = null;
  const created = await supabase.from("conversations").insert({ listing_id: listingId }).select("id").single();
  if (created.data) conversationId = created.data.id;
  else if (created.error?.code === "23505") {
    const { data: claims } = await supabase.auth.getClaims();
    const existing = await supabase
      .from("conversations")
      .select("id")
      .eq("listing_id", listingId)
      .eq("buyer_id", claims?.claims?.sub ?? "")
      .maybeSingle();
    conversationId = existing.data?.id ?? null;
  } else {
    return { error: friendlyDbError(created.error, "That message didn't send. Try again."), body };
  }
  if (!conversationId) return { error: "That message didn't send. Try again.", body };

  const sent = await supabase.from("messages").insert({ conversation_id: conversationId, body });
  if (sent.error) return { error: friendlyDbError(sent.error, "That message didn't send. Try again."), body };
  redirect(`/messages/${conversationId}`);
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(conversationId: string, rawBody: string): Promise<SendResult> {
  if (!UUID.test(conversationId)) return { ok: false, error: "That chat wasn't found." };
  const body = cleanBody(rawBody);
  if (typeof body !== "string") return { ok: false, error: body.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, body })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: friendlyDbError(error, "That message didn't send. Try again.") };
  return { ok: true, message: data as ChatMessage };
}

/** Called by the chat when the other person's messages are on screen. */
export async function markConversationRead(conversationId: string): Promise<number> {
  if (!UUID.test(conversationId)) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  return data ?? 0;
}
