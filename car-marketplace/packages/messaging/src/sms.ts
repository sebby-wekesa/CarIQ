export type SmsResult = { ref: string | null };

export interface SmsProvider {
  readonly name: string;
  /** Sends one SMS to an E.164 number. Throws with a readable message when it wasn't accepted. */
  send(input: { to: string; message: string }): Promise<SmsResult>;
}

/** Status codes Africa's Talking uses for "accepted": processed, sent, queued. */
const AT_ACCEPTED = new Set([100, 101, 102]);

export type AfricasTalkingConfig = {
  username: string;
  apiKey: string;
  /** Registered alphanumeric sender ID or short code; omit to use the shared default. */
  senderId?: string;
  fetch?: typeof fetch;
};

export class AfricasTalkingSms implements SmsProvider {
  readonly name = "africastalking";
  constructor(private readonly config: AfricasTalkingConfig) {}

  async send({ to, message }: { to: string; message: string }): Promise<SmsResult> {
    const host = this.config.username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const body = new URLSearchParams({ username: this.config.username, to, message });
    if (this.config.senderId) body.set("from", this.config.senderId);
    const response = await (this.config.fetch ?? fetch)(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: this.config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Africa's Talking HTTP ${response.status}: ${text.slice(0, 200)}`);
    let recipient: { statusCode?: number; status?: string; messageId?: string } | undefined;
    try {
      recipient = JSON.parse(text)?.SMSMessageData?.Recipients?.[0];
    } catch {
      throw new Error(`Africa's Talking sent an unreadable reply: ${text.slice(0, 200)}`);
    }
    if (!recipient || !AT_ACCEPTED.has(Number(recipient.statusCode))) {
      throw new Error(`Africa's Talking did not accept the SMS: ${recipient?.status ?? "no recipient in reply"}`);
    }
    return { ref: recipient.messageId ?? null };
  }
}

/** Development and staging before an SMS account exists: logs instead of sending. */
export class ConsoleSms implements SmsProvider {
  readonly name = "console";
  readonly sent: { to: string; message: string }[] = [];
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(input: { to: string; message: string }): Promise<SmsResult> {
    this.sent.push(input);
    this.log(`[sms:console] to ${input.to}: ${input.message}`);
    return { ref: `console-${this.sent.length}` };
  }
}
