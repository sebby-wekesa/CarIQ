import { z } from "zod";
import { BODY_TYPES, CONDITIONS, DRIVETRAINS, FUEL_TYPES, MIN_YEAR, TRANSMISSIONS, maxYear } from "./vehicle";
import { normalizeKenyanPlate, parseChassis } from "./vehicle-ids";

/** Features a buyer filters on. Keys are stored in listings.features. */
export const FEATURES = [
  { key: "air_conditioning", label: "Air conditioning" },
  { key: "climate_control", label: "Climate control" },
  { key: "reverse_camera", label: "Reverse camera" },
  { key: "parking_sensors", label: "Parking sensors" },
  { key: "navigation", label: "Navigation" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "android_auto_carplay", label: "Android Auto / CarPlay" },
  { key: "keyless_entry", label: "Keyless entry" },
  { key: "push_start", label: "Push-button start" },
  { key: "cruise_control", label: "Cruise control" },
  { key: "leather_seats", label: "Leather seats" },
  { key: "electric_seats", label: "Electric seats" },
  { key: "sunroof", label: "Sunroof" },
  { key: "alloy_wheels", label: "Alloy wheels" },
  { key: "fog_lights", label: "Fog lights" },
  { key: "third_row", label: "Third-row seats" },
  { key: "roof_rails", label: "Roof rails" },
  { key: "tow_bar", label: "Tow bar" },
  { key: "diff_lock", label: "Diff lock" },
  { key: "airbags", label: "Airbags" },
  { key: "abs", label: "ABS brakes" },
  { key: "power_steering", label: "Power steering" },
  { key: "electric_windows", label: "Electric windows" },
  { key: "service_history", label: "Service history" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
const FEATURE_KEYS = FEATURES.map((f) => f.key) as [FeatureKey, ...FeatureKey[]];

export const MAX_PHOTOS = 20;
export const MIN_PHOTOS_TO_SUBMIT = 3;

/** "1,350,000" or "1 350 000" → 1350000 */
const wholeNumber = (field: string, min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
    z.coerce
      .number({ error: `Enter the ${field}` })
      .int({ error: `Enter the ${field} as a whole number` })
      .min(min, { error: `The ${field} must be at least ${min.toLocaleString("en-KE")}` })
      .max(max, { error: `The ${field} looks too high — check it` }),
  );

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const chassisSchema = z
  .string({ error: "Enter the chassis number" })
  .trim()
  .min(1, { error: "Enter the chassis number" })
  .transform((value, ctx) => {
    const info = parseChassis(value);
    if (!info) {
      ctx.issues.push({
        code: "custom",
        message: "Enter the chassis number as on the logbook, e.g. NZE141-1234567 or a 17-character VIN",
        input: value,
      });
      return z.NEVER;
    }
    return info;
  });

export const plateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const plate = normalizeKenyanPlate(value);
    if (!plate) {
      ctx.issues.push({ code: "custom", message: "Enter the number plate as shown, e.g. KDA 123A", input: value });
      return z.NEVER;
    }
    return plate;
  });

const yearSchema = z.coerce
  .number({ error: "Choose the year" })
  .int()
  .min(MIN_YEAR, { error: `Year must be ${MIN_YEAR} or later` })
  .refine((y) => y <= maxYear(), { error: "That year is in the future" });

const modelIdSchema = z.coerce.number({ error: "Choose the model" }).int().positive({ error: "Choose the model" });

/** Step one: enough to create the draft and its Passport. */
export const listingStartSchema = z.object({
  chassis: chassisSchema,
  modelId: modelIdSchema,
  year: yearSchema,
});

export const listingDetailsSchema = z.object({
  modelId: modelIdSchema,
  year: yearSchema,
  condition: z.enum(CONDITIONS, { error: "Choose the condition" }),
  bodyType: z.enum(BODY_TYPES, { error: "Choose the body type" }),
  fuelType: z.enum(FUEL_TYPES, { error: "Choose the fuel" }),
  transmission: z.enum(TRANSMISSIONS, { error: "Choose the gearbox" }),
  drivetrain: z
    .union([z.enum(DRIVETRAINS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  engineCc: z
    .union([z.literal(""), wholeNumber("engine size", 50, 20000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  colour: optionalText(40, "Keep the colour under 40 characters"),
  plate: plateSchema,
  mileageKm: wholeNumber("mileage", 0, 2_000_000),
  priceKes: wholeNumber("price", 10_000, 1_000_000_000),
  negotiable: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  countyCode: z.coerce.number({ error: "Choose the county" }).int().min(1, { error: "Choose the county" }).max(47),
  town: optionalText(80, "Keep the town under 80 characters"),
  description: optionalText(5000, "Keep the description under 5,000 characters"),
  features: z.array(z.enum(FEATURE_KEYS)).max(FEATURES.length).default([]),
});

export type ListingDetailsInput = z.infer<typeof listingDetailsSchema>;

/** The documents a seller can attach to the Passport, in the order we ask for them. */
export const DOCUMENT_KINDS = [
  {
    kind: "odometer_photo",
    label: "Dashboard photo",
    hint: "Engine on, mileage clearly visible. Required to submit.",
    required: true,
  },
  {
    kind: "auction_sheet",
    label: "Japanese auction sheet",
    hint: "Shows the car's grade, damage map and auction mileage.",
    required: false,
  },
  {
    kind: "export_certificate",
    label: "Export or deregistration certificate",
    hint: "Issued in Japan (or the last country of registration) before export.",
    required: false,
  },
  {
    kind: "jevic_certificate",
    label: "JEVIC odometer certificate",
    hint: "Independent mileage check done in Japan.",
    required: false,
  },
  {
    kind: "qisj_certificate",
    label: "QISJ inspection certificate",
    hint: "The pre-shipment inspection for Kenya.",
    required: false,
  },
  {
    kind: "logbook",
    label: "NTSA logbook",
    hint: "Your e-logbook PDF. Owner details are never shown to buyers.",
    required: false,
  },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["kind"];

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
