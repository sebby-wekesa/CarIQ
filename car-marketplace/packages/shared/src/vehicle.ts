/**
 * Vehicle vocabularies. Each list mirrors a Postgres enum in
 * supabase/migrations/…_init_schema.sql — change both together.
 */

export const BODY_TYPES = [
  "saloon",
  "hatchback",
  "station_wagon",
  "suv",
  "pickup",
  "van",
  "minibus",
  "coupe",
  "convertible",
  "truck",
  "bus",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric", "lpg"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["automatic", "manual", "cvt", "semi_automatic"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const DRIVETRAINS = ["fwd", "rwd", "awd", "four_wd"] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];

/** How Kenyans describe a car's history — the first filter most buyers use. */
export const CONDITIONS = ["foreign_used", "locally_used", "new"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LISTING_STATUSES = ["draft", "pending_review", "live", "paused", "sold", "expired", "rejected"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

const LABELS: Record<string, string> = {
  saloon: "Saloon",
  hatchback: "Hatchback",
  station_wagon: "Station wagon",
  suv: "SUV",
  pickup: "Pickup",
  van: "Van",
  minibus: "Minibus",
  coupe: "Coupe",
  convertible: "Convertible",
  truck: "Truck",
  bus: "Bus",
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
  lpg: "LPG",
  automatic: "Automatic",
  manual: "Manual",
  cvt: "CVT",
  semi_automatic: "Semi-automatic",
  fwd: "Front-wheel drive",
  rwd: "Rear-wheel drive",
  awd: "All-wheel drive",
  four_wd: "4WD",
  foreign_used: "Foreign used",
  locally_used: "Locally used",
  new: "Brand new",
  draft: "Draft",
  pending_review: "In review",
  live: "Live",
  paused: "Paused",
  sold: "Sold",
  expired: "Expired",
  rejected: "Rejected",
};

export function labelFor(value: string): string {
  return LABELS[value] ?? value;
}

/** Oldest model year we accept. Kenya's import rule is 8 years, but locally used cars can be older. */
export const MIN_YEAR = 1980;
export const maxYear = (now = new Date()) => now.getFullYear() + 1;
