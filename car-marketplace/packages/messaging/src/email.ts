export type EmailMessage = { to: string; subject: string; text: string; html: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ ref: string | null }>;
}

export type ResendConfig = { apiKey: string; from: string; fetch?: typeof fetch };

/** Resend (resend.com): one HTTPS call, generous free tier. Any provider with an API fits the interface. */
export class ResendEmail implements EmailProvider {
  readonly name = "resend";
  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<{ ref: string | null }> {
    const response = await (this.config.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${text.slice(0, 200)}`);
    try {
      return { ref: (JSON.parse(text) as { id?: string }).id ?? null };
    } catch {
      return { ref: null };
    }
  }
}

export class ConsoleEmail implements EmailProvider {
  readonly name = "console";
  readonly sent: EmailMessage[] = [];
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(message: EmailMessage): Promise<{ ref: string | null }> {
    this.sent.push(message);
    this.log(`[email:console] to ${message.to}: ${message.subject}\n${message.text}`);
    return { ref: `console-${this.sent.length}` };
  }
}
