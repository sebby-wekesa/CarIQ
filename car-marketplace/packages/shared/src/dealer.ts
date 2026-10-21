import { z } from "zod";
import { phoneSchema } from "./schemas";

/** KRA PIN: A (individual) or P (company), nine digits, a letter. */
export const KRA_PIN = /^[AP]\d{9}[A-Z]$/;

export const DEALER_ROLES = ["owner", "manager", "sales"] as const;
export type DealerRole = (typeof DEALER_ROLES)[number];

export const DEALER_ROLE_LABELS: Record<DealerRole, string> = {
  owner: "Owner",
  manager: "Manager",
  sales: "Sales",
};

export const DEALER_ROLE_HINTS: Record<DealerRole, string> = {
  owner: "Everything, including the team and verified details.",
  manager: "Stock, leads and chats, documents, and adding sales staff.",
  sales: "Stock, leads and chats.",
};

/** The documents we need before approving a dealership, in the order we ask for them. */
export const DEALER_DOCUMENT_KINDS = [
  {
    kind: "kra_pin_certificate",
    label: "KRA PIN certificate",
    hint: "From iTax, in the business name (or the owner's name for a sole proprietor).",
    required: true,
  },
  {
    kind: "business_registration",
    label: "Business registration",
    hint: "Certificate of incorporation or business name registration (BRS / eCitizen).",
    required: true,
  },
  {
    kind: "owner_id",
    label: "Owner's ID or passport",
    hint: "A clear photo of the front. Only our review team sees it.",
    required: true,
  },
  {
    kind: "business_permit",
    label: "County business permit",
    hint: "Optional, but it helps us approve you faster.",
    required: false,
  },
] as const;

export type DealerDocumentKind = (typeof DEALER_DOCUMENT_KINDS)[number]["kind"];

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    .transform((v) => (v ? v : null));

const countySchema = z.coerce
  .number({ error: "Choose the county" })
  .int()
  .min(1, { error: "Choose the county" })
  .max(47, { error: "Choose the county" });

export const dealerApplicationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Enter the business name" })
    .max(120, { error: "Keep the business name under 120 characters" }),
  phone: phoneSchema,
  countyCode: countySchema,
  town: z.string().trim().min(2, { error: "Enter the town or area" }).max(80, { error: "Keep the town under 80 characters" }),
  address: optionalText(200, "Keep the address under 200 characters"),
  kraPin: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/\s+/g, ""))
    .pipe(z.string().regex(KRA_PIN, { error: "Enter the KRA PIN as on the certificate, e.g. P051234567X" })),
  businessRegNo: optionalText(40, "Keep the registration number under 40 characters").transform((v) =>
    v ? v.toUpperCase() : null,
  ),
  description: optionalText(2000, "Keep the description under 2,000 characters"),
});

export type DealerApplication = z.infer<typeof dealerApplicationSchema>;

/** What a dealer can change on its showroom page at any time. */
export const dealerProfileSchema = z.object({
  phone: phoneSchema,
  town: z.string().trim().min(2, { error: "Enter the town or area" }).max(80, { error: "Keep the town under 80 characters" }),
  address: optionalText(200, "Keep the address under 200 characters"),
  openingHours: optionalText(120, "Keep the opening hours under 120 characters"),
  description: optionalText(2000, "Keep the description under 2,000 characters"),
  acceptsCalls: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  acceptsWhatsapp: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type DealerProfileInput = z.infer<typeof dealerProfileSchema>;

export const staffInviteSchema = z.object({
  phone: phoneSchema,
  role: z.enum(["manager", "sales"], { error: "Choose a role" }),
});
