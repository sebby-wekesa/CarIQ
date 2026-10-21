// Supabase Auth "Send SMS" hook → Africa's Talking.
//
// Supabase calls this function whenever it needs to send a phone OTP. We verify the
// webhook signature, then deliver the code through Africa's Talking (local, cheap,
// supports Kenyan sender IDs).
//
// Secrets (supabase secrets set …):
//   SEND_SMS_HOOK_SECRET      v1,whsec_…  (from Dashboard → Auth → Hooks)
//   AFRICASTALKING_USERNAME   your AT app username ("sandbox" for the sandbox)
//   AFRICASTALKING_API_KEY    your AT API key
//   AFRICASTALKING_SENDER_ID  optional registered alphanumeric sender ID
//   SMS_LOG_ONLY=true         local dev only: log the code instead of sending it
//
// Docs: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type HookPayload = {
  user: { id: string; phone: string };
  sms: { otp: string };
};

const AT_SENT_CODES = new Set([100, 101, 102]); // Processed, Sent, Queued

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hookError(message: string, httpCode = 500): Response {
  return json({ error: { http_code: httpCode, message } }, httpCode);
}

function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return hookError("Method not allowed", 405);

  const secret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!secret) return hookError("SEND_SMS_HOOK_SECRET is not configured");

  let payload: HookPayload;
  try {
    const raw = await req.text();
    const webhook = new Webhook(secret.replace("v1,whsec_", ""));
    payload = webhook.verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return hookError("Invalid webhook signature", 401);
  }

  const to = toE164(payload.user.phone);
  const appName = Deno.env.get("APP_NAME") ?? "Magari";
  const message = `${payload.sms.otp} is your ${appName} code. It expires in 10 minutes. Never share it with anyone.`;

  if (Deno.env.get("SMS_LOG_ONLY") === "true") {
    console.log(`[send-sms] LOG ONLY — code for ${to}: ${payload.sms.otp}`);
    return json({});
  }

  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  if (!username || !apiKey) return hookError("Africa's Talking credentials are not configured");

  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to, message });
  const senderId = Deno.env.get("AFRICASTALKING_SENDER_ID");
  if (senderId) body.set("from", senderId);

  try {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      console.error(`[send-sms] Africa's Talking HTTP ${res.status}: ${await res.text()}`);
      return hookError("SMS provider rejected the request", 502);
    }

    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!recipient || !AT_SENT_CODES.has(Number(recipient.statusCode))) {
      console.error(`[send-sms] Not delivered to ${to}:`, JSON.stringify(data));
      return hookError(`SMS not sent: ${recipient?.status ?? "unknown error"}`, 502);
    }

    return json({});
  } catch (error) {
    console.error("[send-sms] Network error", error);
    return hookError("Could not reach the SMS provider", 502);
  }
});
