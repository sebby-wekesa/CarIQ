import "server-only";
import { z } from "zod";

/**
 * Server-only configuration, read at request time (not inlined at build), so one build can be
 * deployed to staging and production with different secrets. Values are checked where they're
 * needed, so an unconfigured payment provider does not break unrelated pages.
 */
const schema = z.object({
  supabaseSecretKey: z.string().min(1).optional(),
  cronSecret: z.string().min(16).optional(),
  smsProvider: z.enum(["console", "africastalking"]).default("console"),
  atUsername: z.string().min(1).optional(),
  atApiKey: z.string().min(1).optional(),
  atSenderId: z.string().min(1).optional(),
  emailProvider: z.enum(["console", "resend"]).default("console"),
  resendApiKey: z.string().min(1).optional(),
  emailFrom: z.string().min(3).optional(),
  paymentProvider: z.enum(["mock", "cashia"]).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

export function serverEnv(): ServerEnv {
  const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return schema.parse({
    supabaseSecretKey: blank(process.env.SUPABASE_SECRET_KEY),
    cronSecret: blank(process.env.CRON_SECRET),
    smsProvider: blank(process.env.SMS_PROVIDER),
    atUsername: blank(process.env.AFRICASTALKING_USERNAME),
    atApiKey: blank(process.env.AFRICASTALKING_API_KEY),
    atSenderId: blank(process.env.AFRICASTALKING_SENDER_ID),
    emailProvider: blank(process.env.EMAIL_PROVIDER),
    resendApiKey: blank(process.env.RESEND_API_KEY),
    emailFrom: blank(process.env.EMAIL_FROM),
    paymentProvider: blank(process.env.PAYMENT_PROVIDER),
  });
}
