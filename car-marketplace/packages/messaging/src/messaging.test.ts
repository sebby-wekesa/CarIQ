import { describe, expect, it } from "vitest";
import {
  AfricasTalkingSms,
  ConsoleEmail,
  ConsoleSms,
  ResendEmail,
  clip,
  gsmLength,
  isGsm7,
  renderEmail,
  renderSms,
  sendDelivery,
  smsSegments,
  toGsm7,
} from "./index";

const site = { appName: "Magari", siteUrl: "https://magari.co.ke" };
const CONVO = "1779e8b7-6f1c-4c55-9a3e-2b1d0c9e8f7a";
const SEARCH = "5d7dacd0-1604-4e76-bcfb-540af777d851";

describe("GSM-7", () => {
  it("swaps typographic characters for plain ones", () => {
    expect(toGsm7("“Is it still available?” – it’s great…")).toBe('"Is it still available?" - it\'s great...');
  });

  it("drops emoji and keeps accents it can", () => {
    expect(toGsm7("Karibu 🚗 Ngong’ Road, café")).toBe("Karibu Ngong' Road, café");
    expect(toGsm7("Łódź")).toBe("odz");
  });

  it("counts extended characters twice and segments correctly", () => {
    expect(gsmLength("€{}")).toBe(6);
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("🚗")).toBe(1);
    expect(isGsm7("🚗")).toBe(false);
    expect(smsSegments("é".repeat(71))).toBe(1);
  });

  it("clips on a word boundary", () => {
    expect(clip("Is the car still available for viewing this weekend in Nyali?", 30)).toBe("Is the car still available...");
    expect(clip("short", 30)).toBe("short");
  });
});

describe("SMS templates", () => {
  const message = {
    conversation_id: CONVO,
    recipient_is_seller: true,
    sender_name: "Wanjiku Kamau",
    listing_title: "2016 Toyota Corolla Axio",
    excerpt: "Is this car still available?",
    unread: 1,
  };

  it("tells a seller who wrote, about which car, and how to reply", () => {
    expect(renderSms("new_message", message, site)).toBe(
      'Magari: Wanjiku sent you a message about your 2016 Toyota Corolla Axio: "Is this car still available?" Reply: https://magari.co.ke/m/1779e8b7',
    );
  });

  it("says 'the car' to a buyer and counts several messages", () => {
    const text = renderSms("new_message", { ...message, recipient_is_seller: false, sender_name: "Amina", unread: 3 }, site);
    expect(text).toMatch(/^Magari: Amina sent you 3 messages about the 2016 Toyota Corolla Axio/);
  });

  it("names a dealership in full when it replies", () => {
    const text = renderSms("new_message", { ...message, recipient_is_seller: false, sender_name: "Coast Auto Yard", sender_is_dealer: true }, site);
    expect(text).toMatch(/^Magari: Coast Auto Yard sent you a message about the 2016 Toyota Corolla Axio/);
  });

  it("stays in one plain segment however long or fancy the message is", () => {
    const long = { ...message, excerpt: "“Habari!” 🚗 ".repeat(40), listing_title: "2019 Mercedes-Benz GLE 450 4MATIC Coupe AMG Line Premium Plus" };
    const text = renderSms("new_message", long, site);
    expect(isGsm7(text)).toBe(true);
    expect(smsSegments(text)).toBe(1);
    expect(text).toContain("Reply: https://magari.co.ke/m/1779e8b7");
  });

  it("names the car in a saved-search alert", () => {
    expect(
      renderSms("search_alert", { saved_search_id: SEARCH, search_name: "Toyota, under KSh 1.5M, in Mombasa", count: 1, first_title: "2018 Toyota Vitz", first_price_kes: 990000 }, site),
    ).toBe('Magari: 1 new car for "Toyota, under KSh 1.5M, in Mombasa": 2018 Toyota Vitz KSh 990K. See: https://magari.co.ke/s/5d7dacd0');
  });

  it("summarises the day's matches in one SMS", () => {
    const searches = Array.from({ length: 6 }, (_, i) => ({ saved_search_id: SEARCH, name: `Search number ${i + 1} with a long name`, count: i + 1 }));
    const text = renderSms("search_digest", { searches, total: 21 }, site);
    expect(text).toMatch(/^Magari: 21 new cars for your saved searches: "Search number 1/);
    expect(text.endsWith("See: https://magari.co.ke/saved")).toBe(true);
    expect(smsSegments(text)).toBe(1);
  });
});

describe("dealer SMS", () => {
  it("tells an invited salesperson who added them and where to sign in", () => {
    expect(renderSms("dealer_invite", { dealer_name: "Coast Auto Yard", role: "sales", inviter_name: "Bob Otieno" }, site)).toBe(
      "Magari: Bob added you to Coast Auto Yard as sales staff. Sign in with this number at https://magari.co.ke/dealer",
    );
  });

  it("tells the owner about approval, or what to fix, in one segment", () => {
    expect(renderSms("dealer_status", { dealer_name: "Coast Auto Yard", status: "approved", reason: null }, site)).toBe(
      "Magari: Coast Auto Yard is approved. Your Verified dealer badge is live. Add your cars: https://magari.co.ke/dealer",
    );
    const rejected = renderSms(
      "dealer_status",
      { dealer_name: "Kilimanjaro Executive Motors & Japanese Imports Limited", status: "rejected", reason: "The KRA PIN certificate is for a different business name. ".repeat(4) },
      site,
    );
    expect(rejected).toMatch(/^Magari: Kilimanjaro Executive Motors .* needs changes before approval: "The KRA PIN certificate/);
    expect(rejected.endsWith("Fix it: https://magari.co.ke/dealer")).toBe(true);
    expect(smsSegments(rejected)).toBe(1);
    const invite = renderSms("dealer_invite", { dealer_name: "Kilimanjaro Executive Motors & Japanese Imports Limited", role: "manager", inviter_name: "Bartholomew" }, site);
    expect(smsSegments(invite)).toBe(1);
  });
});

describe("email templates", () => {
  it("escapes what people type", () => {
    const email = renderEmail(
      "new_message",
      { conversation_id: CONVO, recipient_is_seller: true, sender_name: "<b>Eve</b>", listing_title: "2016 Toyota Corolla Axio", excerpt: "<script>alert(1)</script>", unread: 1 },
      site,
      "seller@example.com",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain(`https://magari.co.ke/messages/${CONVO}`);
    expect(email.text).toContain("Never send money before you have seen the car");
  });

  it("puts the verification code in the subject", () => {
    expect(renderEmail("email_verification", { code: "482913" }, site, "a@b.co").subject).toBe("Your Magari code: 482913");
  });
});

describe("providers", () => {
  it("sends through Africa's Talking and reads the message id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sms = new AfricasTalkingSms({
      username: "magari",
      apiKey: "key",
      senderId: "MAGARI",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ statusCode: 101, status: "Success", messageId: "ATXid_1" }] } }));
      }) as typeof fetch,
    });
    expect(await sms.send({ to: "+254711100001", message: "Hi" })).toEqual({ ref: "ATXid_1" });
    expect(calls[0]!.url).toBe("https://api.africastalking.com/version1/messaging");
    expect(String(calls[0]!.init.body)).toBe("username=magari&to=%2B254711100001&message=Hi&from=MAGARI");
  });

  it("uses the sandbox for the sandbox user and reports refusals", async () => {
    let url = "";
    const sms = new AfricasTalkingSms({
      username: "sandbox",
      apiKey: "key",
      fetch: (async (u: string) => {
        url = u;
        return new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ statusCode: 405, status: "InsufficientBalance" }] } }));
      }) as typeof fetch,
    });
    await expect(sms.send({ to: "+254711100001", message: "Hi" })).rejects.toThrow("InsufficientBalance");
    expect(url).toContain("api.sandbox.africastalking.com");
  });

  it("sends email through Resend", async () => {
    let body = "";
    const email = new ResendEmail({
      apiKey: "re_key",
      from: "Magari <alerts@magari.co.ke>",
      fetch: (async (_u: string, init: RequestInit) => {
        body = String(init.body);
        return new Response(JSON.stringify({ id: "email_1" }));
      }) as typeof fetch,
    });
    expect(await email.send({ to: "a@b.co", subject: "S", text: "T", html: "<p>T</p>" })).toEqual({ ref: "email_1" });
    expect(JSON.parse(body)).toMatchObject({ from: "Magari <alerts@magari.co.ke>", to: ["a@b.co"], subject: "S" });
  });
});

describe("sendDelivery", () => {
  const deps = () => ({ sms: new ConsoleSms(() => {}), email: new ConsoleEmail(() => {}), site });

  it("renders and sends an SMS", async () => {
    const d = deps();
    const outcome = await sendDelivery(
      { id: "1", channel: "sms", kind: "search_alert", to_address: "+254712345678", context: { saved_search_id: SEARCH, search_name: "Hondas", count: 2, first_title: null, first_price_kes: null } },
      d,
    );
    expect(outcome).toMatchObject({ sent: true, to: "+254712345678", body: 'Magari: 2 new cars for "Hondas". See: https://magari.co.ke/s/5d7dacd0' });
    expect(d.sms.sent).toHaveLength(1);
  });

  it("refuses numbers that aren't Kenyan mobiles", async () => {
    expect(await sendDelivery({ id: "1", channel: "sms", kind: "email_verification", to_address: "+447700900000", context: {} }, deps())).toMatchObject({ sent: false });
  });

  it("turns provider errors into a failed outcome", async () => {
    const d = { ...deps(), email: { name: "broken", send: async () => { throw new Error("SMTP down"); } } };
    expect(await sendDelivery({ id: "1", channel: "email", kind: "email_verification", to_address: "a@b.co", context: { code: "1" } }, d)).toEqual({ sent: false, error: "SMTP down" });
  });
});
