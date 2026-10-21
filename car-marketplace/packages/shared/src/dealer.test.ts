import { describe, expect, it } from "vitest";
import { dealerApplicationSchema, dealerProfileSchema, staffInviteSchema } from "./dealer";

describe("dealer forms", () => {
  const good = {
    name: "  Coast Auto Yard ",
    phone: "0722 000 002",
    countyCode: "1",
    town: "Nyali",
    kraPin: "p051 234567x",
    businessRegNo: "pvt-abc123",
  };

  it("cleans up an application", () => {
    const parsed = dealerApplicationSchema.parse(good);
    expect(parsed).toEqual({
      name: "Coast Auto Yard",
      phone: "+254722000002",
      countyCode: 1,
      town: "Nyali",
      address: null,
      kraPin: "P051234567X",
      businessRegNo: "PVT-ABC123",
      description: null,
    });
  });

  it("explains a bad KRA PIN and phone number", () => {
    const result = dealerApplicationSchema.safeParse({ ...good, kraPin: "12345", phone: "12" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    expect(messages).toContain("kraPin: Enter the KRA PIN as on the certificate, e.g. P051234567X");
    expect(messages).toContain("phone: Enter a Kenyan mobile number, e.g. 0712 345 678");
  });

  it("reads checkboxes on the showroom form", () => {
    const parsed = dealerProfileSchema.parse({ phone: "+254722000002", town: "Nyali", acceptsCalls: "on" });
    expect(parsed.acceptsCalls).toBe(true);
    expect(parsed.acceptsWhatsapp).toBe(false);
    expect(parsed.openingHours).toBeNull();
  });

  it("only invites managers and sales staff", () => {
    expect(staffInviteSchema.safeParse({ phone: "0733000003", role: "owner" }).success).toBe(false);
    expect(staffInviteSchema.parse({ phone: "0733000003", role: "sales" })).toEqual({ phone: "+254733000003", role: "sales" });
  });
});
