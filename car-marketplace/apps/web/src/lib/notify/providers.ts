import "server-only";
import { AfricasTalkingSms, ConsoleEmail, ConsoleSms, ResendEmail, type EmailProvider, type SmsProvider } from "@cm/messaging";
import type { ServerEnv } from "@/lib/server-env";

export function smsProvider(config: ServerEnv): SmsProvider {
  if (config.smsProvider === "africastalking") {
    if (!config.atUsername || !config.atApiKey) {
      throw new Error("SMS_PROVIDER=africastalking needs AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY");
    }
    return new AfricasTalkingSms({ username: config.atUsername, apiKey: config.atApiKey, senderId: config.atSenderId });
  }
  return new ConsoleSms();
}

export function emailProvider(config: ServerEnv): EmailProvider {
  if (config.emailProvider === "resend") {
    if (!config.resendApiKey || !config.emailFrom) throw new Error("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM");
    return new ResendEmail({ apiKey: config.resendApiKey, from: config.emailFrom });
  }
  return new ConsoleEmail();
}
