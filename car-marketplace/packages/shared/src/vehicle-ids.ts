/**
 * Vehicle identifiers.
 *
 * Japanese-market cars (most of Kenya's imports) carry a frame number such as
 * NZE141-1234567: a model code, a hyphen, a serial. Cars built for other markets
 * carry a 17-character VIN. The Passport keys a car on its chassis number with
 * spaces and hyphens removed, so "NZE141-1234567" and "nze141 1234567" are the same car.
 *
 * Masking rules mirror private.mask_chassis() in the Sprint 1 migration.
 */

const VIN17 = /^[A-HJ-NPR-Z0-9]{17}$/;
const FRAME_WITH_HYPHEN = /^([A-Z0-9]{2,8})-([0-9]{4,8})$/;
const FRAME_KEY = /^(?=.*[A-Z])[A-Z0-9]{6,17}$/;

export type ChassisInfo = {
  /** As we display it: uppercase, single hyphen kept for frame numbers. */
  display: string;
  /** Matching key: uppercase letters and digits only. Unique per car. */
  key: string;
  /** Model code from a Japanese frame number (e.g. NZE141), when present. */
  modelCode: string | null;
  /** True for a 17-character VIN — eligible for VIN-based history reports. */
  isVin17: boolean;
};

export function parseChassis(input: string): ChassisInfo | null {
  if (typeof input !== "string") return null;
  const cleaned = input.toUpperCase().trim().replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/-+/g, "-");
  const key = cleaned.replace(/-/g, "");

  if (VIN17.test(key) && !cleaned.includes("-")) {
    return { display: key, key, modelCode: null, isVin17: true };
  }

  const frame = cleaned.match(FRAME_WITH_HYPHEN);
  if (frame) {
    return { display: cleaned, key, modelCode: frame[1] ?? null, isVin17: false };
  }

  if (FRAME_KEY.test(key) && /\d{4,}$/.test(key) && !cleaned.includes("-")) {
    return { display: key, key, modelCode: null, isVin17: VIN17.test(key) };
  }

  return null;
}

/** "NZE141-1234567" → "NZE141-12•••67"; VINs keep the first 6 and last 2 characters. */
export function maskChassis(input: string): string {
  const info = parseChassis(input);
  if (!info) return "•••";
  const frame = info.display.match(FRAME_WITH_HYPHEN);
  if (frame) {
    const serial = frame[2] ?? "";
    return `${frame[1]}-${serial.slice(0, 2)}${"•".repeat(Math.max(serial.length - 4, 1))}${serial.slice(-2)}`;
  }
  const k = info.key;
  return `${k.slice(0, 6)}${"•".repeat(Math.max(k.length - 8, 1))}${k.slice(-2)}`;
}

const KE_PLATE = /^(K[A-Z]{2})(\d{3})([A-Z]?)$/;

/** Kenyan car plates: "kda123a", "KDA 123 A" → "KDA 123A". Returns null if not a car plate. */
export function normalizeKenyanPlate(input: string): string | null {
  if (typeof input !== "string") return null;
  const key = input.toUpperCase().replace(/[\s-]/g, "");
  const m = key.match(KE_PLATE);
  if (!m) return null;
  return `${m[1]} ${m[2]}${m[3]}`;
}
