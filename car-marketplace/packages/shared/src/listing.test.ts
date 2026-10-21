import { describe, expect, it } from "vitest";
import { fieldErrors } from "./schemas";
import { listingDetailsSchema, listingStartSchema } from "./listing";
import { maskChassis, normalizeKenyanPlate, parseChassis } from "./vehicle-ids";

describe("parseChassis", () => {
  it("keeps Japanese frame numbers with their model code", () => {
    expect(parseChassis(" nze141-1234567 ")).toEqual({
      display: "NZE141-1234567",
      key: "NZE1411234567",
      modelCode: "NZE141",
      isVin17: false,
    });
  });

  it("treats spaces and dashes the same", () => {
    expect(parseChassis("GP5 – 1234567")?.key).toBe("GP51234567");
    expect(parseChassis("GP5-1234567")?.key).toBe(parseChassis("gp5 1234567".replace(" ", "-"))?.key);
  });

  it("recognises 17-character VINs", () => {
    expect(parseChassis("jtdbr32e720123456")).toMatchObject({ key: "JTDBR32E720123456", isVin17: true });
  });

  it.each(["", "12345", "ABC", "NZE141-12", "JTDBR32E72012345O", "@@@-1234567"])("rejects %s", (input) => {
    expect(parseChassis(input)).toBeNull();
  });
});

describe("maskChassis", () => {
  it("masks the middle of a frame serial", () => {
    expect(maskChassis("NZE141-1234567")).toBe("NZE141-12•••67");
  });

  it("masks the middle of a VIN", () => {
    expect(maskChassis("JTDBR32E720123456")).toBe("JTDBR3•••••••••56");
  });
});

describe("normalizeKenyanPlate", () => {
  it.each([
    ["kda123a", "KDA 123A"],
    ["KDA 123 A", "KDA 123A"],
    ["KBZ-001", "KBZ 001"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeKenyanPlate(input)).toBe(expected);
  });

  it.each(["ABC 123A", "KD 123A", "KDA 12A", "GK A123B"])("rejects %s", (input) => {
    expect(normalizeKenyanPlate(input)).toBeNull();
  });
});

describe("listing schemas", () => {
  it("parses the start step", () => {
    const parsed = listingStartSchema.parse({ chassis: "nze141-1234567", modelId: "12", year: "2016" });
    expect(parsed.chassis.key).toBe("NZE1411234567");
    expect(parsed.modelId).toBe(12);
  });

  const valid = {
    modelId: "12",
    year: "2016",
    condition: "foreign_used",
    bodyType: "saloon",
    fuelType: "petrol",
    transmission: "automatic",
    drivetrain: "",
    engineCc: "1500",
    colour: "Pearl white",
    plate: "",
    mileageKm: "84,000",
    priceKes: "1,350,000",
    negotiable: "on",
    countyCode: "1",
    town: "Nyali",
    description: "",
    features: ["reverse_camera", "bluetooth"],
  };

  it("parses full details with Kenyan number formats", () => {
    const parsed = listingDetailsSchema.parse(valid);
    expect(parsed).toMatchObject({
      mileageKm: 84000,
      priceKes: 1350000,
      negotiable: true,
      drivetrain: null,
      engineCc: 1500,
      plate: null,
      description: null,
    });
  });

  it("explains problems per field", () => {
    const result = listingDetailsSchema.safeParse({ ...valid, priceKes: "500", plate: "XYZ", features: ["warp_drive"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.priceKes).toMatch(/at least 10,000/);
      expect(errors.plate).toMatch(/KDA 123A/);
      expect(Object.keys(errors).some((k) => k.startsWith("features"))).toBe(true);
    }
  });

  it("treats an unticked negotiable box as false", () => {
    const { negotiable: _drop, ...rest } = valid;
    expect(listingDetailsSchema.parse(rest).negotiable).toBe(false);
  });
});
