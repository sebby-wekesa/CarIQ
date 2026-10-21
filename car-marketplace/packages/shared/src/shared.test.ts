import { describe, expect, it } from "vitest";
import { COUNTIES, countyBySlug } from "./counties";
import { formatKes, formatKesShort } from "./money";
import { fieldErrors, otpSchema, phoneSchema, profileSchema } from "./schemas";

describe("counties", () => {
  it("has all 47 with unique codes and slugs", () => {
    expect(COUNTIES).toHaveLength(47);
    expect(new Set(COUNTIES.map((c) => c.code)).size).toBe(47);
    expect(new Set(COUNTIES.map((c) => c.slug)).size).toBe(47);
  });

  it("finds by slug", () => {
    expect(countyBySlug("mombasa")?.code).toBe(1);
    expect(countyBySlug("nairobi")?.code).toBe(47);
  });
});

describe("money", () => {
  it("formats shillings", () => {
    expect(formatKes(1370000)).toBe("KSh 1,370,000");
  });

  it("shortens for cards", () => {
    expect(formatKesShort(1370000)).toBe("KSh 1.37M");
    expect(formatKesShort(2000000)).toBe("KSh 2M");
    expect(formatKesShort(1500000)).toBe("KSh 1.5M");
    expect(formatKesShort(850000)).toBe("KSh 850K");
  });
});

describe("schemas", () => {
  it("normalises phone input", () => {
    expect(phoneSchema.parse(" 0712 345 678 ")).toBe("+254712345678");
  });

  it("explains a bad phone number", () => {
    const result = phoneSchema.safeParse("12345");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)._form).toMatch(/Kenyan mobile/);
    }
  });

  it("requires a 6-digit code", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
  });

  it("validates a profile", () => {
    expect(profileSchema.parse({ fullName: " Amina Hassan ", countyCode: "1" })).toEqual({
      fullName: "Amina Hassan",
      countyCode: 1,
    });
    const bad = profileSchema.safeParse({ fullName: "A", countyCode: "99" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(Object.keys(fieldErrors(bad.error)).sort()).toEqual(["countyCode", "fullName"]);
    }
  });
});
