import { describe, expect, it } from "vitest";
import { formatKenyanPhone, maskKenyanPhone, normalizeKenyanPhone } from "./phone";

describe("normalizeKenyanPhone", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["+254 712 345 678", "+254712345678"],
    ["(0712) 345-678", "+254712345678"],
    ["0110 123 456", "+254110123456"],
    ["0101234567", "+254101234567"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each([
    "",
    "12345",
    "0212345678", // landline-style prefix
    "07123456789", // too long
    "+255712345678", // Tanzania
    "07123abc78",
    "+",
  ])("rejects %s", (input) => {
    expect(normalizeKenyanPhone(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats for display", () => {
    expect(formatKenyanPhone("0712345678")).toBe("+254 712 345 678");
  });

  it("masks the middle digits", () => {
    expect(maskKenyanPhone("+254712345678")).toBe("+254 7•• ••• 678");
  });
});
