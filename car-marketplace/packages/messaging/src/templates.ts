import { clip, gsmLength, toGsm7 } from "./gsm";
import type { EmailMessage } from "./email";

export type DeliveryKind =
  | "new_message"
  | "search_alert"
  | "search_digest"
  | "email_verification"
  | "dealer_invite"
  | "dealer_status";
export type DeliveryChannel = "sms" | "email";

export type NewMessageContext = {
  conversation_id: string;
  recipient_is_seller: boolean;
  sender_name: string | null;
  /** The reply came from a dealership: use its full name, not a first name. */
  sender_is_dealer?: boolean | null;
  listing_title: string | null;
  excerpt: string | null;
  unread: number | null;
};
export type SearchAlertContext = {
  saved_search_id: string | null;
  search_name: string | null;
  count: number | null;
  first_title: string | null;
  first_price_kes: number | null;
};
export type SearchDigestContext = {
  searches: { saved_search_id: string | null; name: string | null; count: number | null }[];
  total: number | null;
};
export type VerificationContext = { code: string | null };
export type DealerInviteContext = { dealer_name: string | null; role: string | null; inviter_name: string | null };
export type DealerStatusContext = { dealer_name: string | null; status: string | null; reason: string | null };

const ROLE_WORDS: Record<string, string> = { manager: "a manager", sales: "sales staff", owner: "an owner" };

export type Site = { appName: string; siteUrl: string };

const SMS_LIMIT = 160;

/** Short links that fit in an SMS; the app redirects them to the full page after sign-in. */
export const shortLinks = {
  conversation: (site: Site, id: string) => `${base(site)}/m/${id.slice(0, 8)}`,
  savedSearch: (site: Site, id: string) => `${base(site)}/s/${id.slice(0, 8)}`,
  savedSearches: (site: Site) => `${base(site)}/saved`,
};

function base(site: Site) {
  return site.siteUrl.replace(/\/+$/, "");
}

function firstName(name: string | null | undefined, fallback: string) {
  const first = name?.trim().split(/\s+/)[0];
  return first || fallback;
}

export function priceShort(kes: number | null | undefined): string {
  if (!kes) return "";
  if (kes >= 1_000_000) {
    const m = kes / 1_000_000;
    return `KSh ${Number.isInteger(m) ? m : m.toFixed(2).replace(/0$/, "")}M`;
  }
  return `KSh ${Math.round(kes / 1000)}K`;
}

/** Builds "head + quoted middle + tail" so the whole SMS stays within one segment. */
function fit(head: string, middle: string | null, tail: string): string {
  const fixed = gsmLength(toGsm7(head + tail));
  const room = SMS_LIMIT - fixed - 4; // the quotes, colon and space around the middle
  const quote = middle && room >= 20 ? `: "${clip(toGsm7(middle), room)}"` : "";
  return toGsm7(`${head}${quote}${tail}`);
}

export function renderSms(kind: DeliveryKind, context: unknown, site: Site): string {
  const app = toGsm7(site.appName);
  switch (kind) {
    case "new_message": {
      const c = context as NewMessageContext;
      const who = c.sender_is_dealer && c.sender_name ? clip(toGsm7(c.sender_name), 30) : firstName(c.sender_name, c.recipient_is_seller ? "A buyer" : "The seller");
      const car = clip(toGsm7(c.listing_title ?? "car"), 40);
      const what = (c.unread ?? 1) > 1 ? `sent you ${c.unread} messages` : "sent you a message";
      const head = `${app}: ${who} ${what} about ${c.recipient_is_seller ? "your" : "the"} ${car}`;
      return fit(head, c.excerpt, ` Reply: ${shortLinks.conversation(site, c.conversation_id)}`);
    }
    case "search_alert": {
      const c = context as SearchAlertContext;
      const count = c.count ?? 1;
      const car = [c.first_title, priceShort(c.first_price_kes)].filter(Boolean).join(" ");
      const tail = ` See: ${c.saved_search_id ? shortLinks.savedSearch(site, c.saved_search_id) : shortLinks.savedSearches(site)}`;
      const lead = `${app}: ${count} new ${count === 1 ? "car" : "cars"} for "${clip(toGsm7(c.search_name ?? "your search"), 40)}"`;
      const body = car ? `${lead}: ${car}${count > 1 ? " and more" : ""}.` : `${lead}.`;
      return toGsm7(gsmLength(toGsm7(body + tail)) <= SMS_LIMIT ? body + tail : lead + "." + tail);
    }
    case "search_digest": {
      const c = context as SearchDigestContext;
      const total = c.total ?? 0;
      const tail = ` See: ${shortLinks.savedSearches(site)}`;
      let text = `${app}: ${total} new ${total === 1 ? "car" : "cars"} for your saved searches`;
      const parts: string[] = [];
      for (const s of c.searches) {
        const part = `"${clip(toGsm7(s.name ?? "search"), 30)}" (${s.count ?? 0})`;
        if (gsmLength(toGsm7(`${text}: ${[...parts, part].join(", ")}.${tail}`)) > SMS_LIMIT) break;
        parts.push(part);
      }
      if (parts.length) text += `: ${parts.join(", ")}`;
      return toGsm7(`${text}.${tail}`);
    }
    case "email_verification": {
      const c = context as VerificationContext;
      return toGsm7(`${app}: your code is ${c.code ?? ""}`);
    }
    case "dealer_invite": {
      const c = context as DealerInviteContext;
      const who = firstName(c.inviter_name, "Your manager");
      const dealer = clip(toGsm7(c.dealer_name ?? "their dealership"), 40);
      const role = ROLE_WORDS[c.role ?? ""] ?? "staff";
      return toGsm7(`${app}: ${who} added you to ${dealer} as ${role}. Sign in with this number at ${base(site)}/dealer`);
    }
    case "dealer_status": {
      const c = context as DealerStatusContext;
      const dealer = clip(toGsm7(c.dealer_name ?? "Your dealership"), 40);
      if (c.status === "approved") {
        return toGsm7(`${app}: ${dealer} is approved. Your Verified dealer badge is live. Add your cars: ${base(site)}/dealer`);
      }
      return fit(`${app}: ${dealer} needs changes before approval`, c.reason, ` Fix it: ${base(site)}/dealer`);
    }
  }
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const SAFETY = "Never send money before you have seen the car and checked its logbook on eCitizen.";

function emailLayout(site: Site, heading: string, paragraphs: string[], button?: { label: string; href: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f3;font-family:Arial,Helvetica,sans-serif;color:#10231c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d5ddd8;border-radius:10px">
<tr><td style="padding:20px 24px 4px"><span style="display:inline-block;background:#f5c400;border:2px solid #10231c;border-radius:4px;padding:3px 10px;font-weight:bold;letter-spacing:1px">${escape(site.appName.toUpperCase())}</span></td></tr>
<tr><td style="padding:12px 24px 0"><h1 style="font-size:20px;line-height:1.3;margin:0">${escape(heading)}</h1></td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 24px 0;font-size:15px;line-height:1.5">${escape(p)}</td></tr>`).join("\n")}
${button ? `<tr><td style="padding:20px 24px 0"><a href="${escape(button.href)}" style="display:inline-block;background:#145a43;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">${escape(button.label)}</a></td></tr>` : ""}
<tr><td style="padding:20px 24px 20px;font-size:13px;color:#4e5f58;line-height:1.5">${escape(SAFETY)}<br>Change these emails at ${escape(`${base(site)}/account/notifications`)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs, ...(button ? ["", `${button.label}: ${button.href}`] : []), "", SAFETY,
    `Change these emails at ${base(site)}/account/notifications`].join("\n");
  return { html, text };
}

export function renderEmail(kind: DeliveryKind, context: unknown, site: Site, to: string): EmailMessage {
  switch (kind) {
    case "new_message": {
      const c = context as NewMessageContext;
      const who = c.sender_is_dealer && c.sender_name ? c.sender_name : firstName(c.sender_name, c.recipient_is_seller ? "A buyer" : "The seller");
      const car = c.listing_title ?? "a car";
      const subject = `${who} sent you a message about ${c.recipient_is_seller ? "your" : "the"} ${car}`;
      const { html, text } = emailLayout(site, subject, [c.excerpt ? `"${c.excerpt}"` : "Open the chat to read it."], {
        label: "Reply on " + site.appName,
        href: `${base(site)}/messages/${c.conversation_id}`,
      });
      return { to, subject, text, html };
    }
    case "search_alert": {
      const c = context as SearchAlertContext;
      const count = c.count ?? 1;
      const subject = `${count} new ${count === 1 ? "car" : "cars"} for "${c.search_name ?? "your search"}"`;
      const lines = [c.first_title ? `Newest: ${c.first_title}${c.first_price_kes ? `, ${priceShort(c.first_price_kes)}` : ""}.` : ""].filter(Boolean);
      const { html, text } = emailLayout(site, subject, lines.length ? lines : ["New cars match your saved search."], {
        label: "See the cars",
        href: c.saved_search_id ? `${base(site)}/account/saved/searches/${c.saved_search_id}/open` : `${base(site)}/account/saved/searches`,
      });
      return { to, subject, text, html };
    }
    case "search_digest": {
      const c = context as SearchDigestContext;
      const total = c.total ?? 0;
      const subject = `${total} new ${total === 1 ? "car" : "cars"} for your saved searches`;
      const lines = c.searches.map((s) => `${s.name ?? "Saved search"}: ${s.count ?? 0} new`);
      const { html, text } = emailLayout(site, subject, lines, { label: "See your searches", href: `${base(site)}/account/saved/searches` });
      return { to, subject, text, html };
    }
    case "email_verification": {
      const c = context as VerificationContext;
      const subject = `Your ${site.appName} code: ${c.code ?? ""}`;
      const { html, text } = emailLayout(site, `Your code is ${c.code ?? ""}`, [
        `Enter it on ${site.appName} to confirm this email address. It works for 30 minutes.`,
        "If you didn't ask for it, ignore this email.",
      ]);
      return { to, subject, text, html };
    }
    case "dealer_invite": {
      const c = context as DealerInviteContext;
      const subject = `You've been added to ${c.dealer_name ?? "a dealership"} on ${site.appName}`;
      const { html, text } = emailLayout(site, subject, [
        `${c.inviter_name ?? "A colleague"} added you as ${ROLE_WORDS[c.role ?? ""] ?? "staff"}.`,
      ], { label: "Open the dealer dashboard", href: `${base(site)}/dealer` });
      return { to, subject, text, html };
    }
    case "dealer_status": {
      const c = context as DealerStatusContext;
      const approved = c.status === "approved";
      const subject = approved
        ? `${c.dealer_name ?? "Your dealership"} is approved`
        : `${c.dealer_name ?? "Your dealership"} needs changes`;
      const { html, text } = emailLayout(
        site,
        subject,
        approved ? ["Your Verified dealer badge is live. Add your cars from the dashboard."] : [c.reason ?? "Open the dashboard to see what to fix."],
        { label: "Open the dealer dashboard", href: `${base(site)}/dealer` },
      );
      return { to, subject, text, html };
    }
  }
}
