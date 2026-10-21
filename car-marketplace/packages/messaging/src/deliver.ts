import type { EmailProvider } from "./email";
import type { SmsProvider } from "./sms";
import { renderEmail, renderSms, type DeliveryChannel, type DeliveryKind, type Site } from "./templates";

export type ClaimedDelivery = {
  id: string;
  channel: DeliveryChannel;
  kind: DeliveryKind;
  to_address: string | null;
  context: unknown;
};

export type DeliveryOutcome =
  | { sent: true; to: string; body: string; ref: string | null }
  | { sent: false; error: string };

/** Writes and sends one claimed delivery. Never throws: failures come back as outcomes to record. */
export async function sendDelivery(
  delivery: ClaimedDelivery,
  deps: { sms: SmsProvider; email: EmailProvider; site: Site },
): Promise<DeliveryOutcome> {
  const to = delivery.to_address?.trim();
  if (!to) return { sent: false, error: "No address to send to" };
  try {
    if (delivery.channel === "sms") {
      if (!/^\+254[17]\d{8}$/.test(to)) return { sent: false, error: `Not a Kenyan mobile number: ${to}` };
      const body = renderSms(delivery.kind, delivery.context, deps.site);
      const { ref } = await deps.sms.send({ to, message: body });
      return { sent: true, to, body, ref };
    }
    const message = renderEmail(delivery.kind, delivery.context, deps.site, to);
    const { ref } = await deps.email.send(message);
    // The plain-text version starts with the subject as its heading.
    return { sent: true, to, body: message.text, ref };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
