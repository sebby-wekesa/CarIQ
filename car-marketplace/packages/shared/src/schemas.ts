import { z } from "zod";
import { normalizeKenyanPhone } from "./phone";

/** Accepts any common Kenyan format and outputs E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter your phone number" })
  .transform((value, ctx) => {
    const normalized = normalizeKenyanPhone(value);
    if (!normalized) {
      ctx.issues.push({
        code: "custom",
        message: "Enter a Kenyan mobile number, e.g. 0712 345 678",
        input: value,
      });
      return z.NEVER;
    }
    return normalized;
  });

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "Enter the 6-digit code we sent you" });

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Enter your name" })
    .max(80, { error: "Keep your name under 80 characters" }),
  countyCode: z.coerce
    .number()
    .int()
    .min(1, { error: "Choose your county" })
    .max(47, { error: "Choose your county" }),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Flatten zod errors into { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
