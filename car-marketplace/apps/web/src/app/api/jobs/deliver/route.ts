import { timingSafeEqual } from "node:crypto";
import { sendDelivery, type ClaimedDelivery } from "@cm/messaging";
import { env } from "@/lib/env";
import { emailProvider, smsProvider } from "@/lib/notify/providers";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends due SMS and email from the outbox. Call every minute from a scheduler with
 * "Authorization: Bearer <CRON_SECRET>" (Vercel Cron, Supabase pg_cron + pg_net, or any cron
 * service). Safe to run concurrently: rows are claimed with SKIP LOCKED.
 */
export async function POST(request: Request) {
  return run(request);
}

/** Vercel Cron calls with GET. */
export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const config = serverEnv();
  if (!config.cronSecret || !authorised(request.headers.get("authorization"), config.cronSecret)) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }
  if (!config.supabaseSecretKey) {
    return Response.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  }

  const admin = createAdminClient(config.supabaseSecretKey);
  const deps = { sms: smsProvider(config), email: emailProvider(config), site: { appName: env.appName, siteUrl: env.siteUrl } };
  const summary = { claimed: 0, sent: 0, failed: 0 };
  const started = Date.now();

  // Drain in batches, but stop well inside a typical 60-second function limit.
  while (Date.now() - started < 40_000) {
    const { data: batch, error } = await admin.rpc("claim_deliveries", { p_limit: 50 });
    if (error) {
      console.error("[deliver] claim failed", error);
      return Response.json({ error: "Could not read the outbox", ...summary }, { status: 500 });
    }
    if (!batch?.length) break;
    summary.claimed += batch.length;

    for (const row of batch) {
      if (!row.id || !row.channel || !row.kind) continue;
      const outcome = await sendDelivery(row as ClaimedDelivery, deps);
      const { error: finishError } = await admin.rpc("finish_delivery", {
        p_id: row.id,
        p_sent: outcome.sent,
        ...(outcome.sent
          ? { p_sent_to: outcome.to, p_body: outcome.body, p_provider_ref: outcome.ref ?? undefined }
          : { p_error: outcome.error }),
      });
      if (finishError) console.error("[deliver] could not record outcome", row.id, finishError);
      if (outcome.sent) summary.sent++;
      else {
        summary.failed++;
        console.warn("[deliver] not sent", row.id, row.channel, row.kind, outcome.error);
      }
    }
    if (batch.length < 50) break;
  }

  return Response.json(summary);
}

function authorised(header: string | null, secret: string) {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
