import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    ["/account", "/account"],
    ["/account?welcome=1", "/account?welcome=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/login", "/"],
    ["/login?next=/account", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("friendlyAuthError", () => {
  it("explains an expired code", () => {
    expect(friendlyAuthError({ code: "otp_expired" })).toMatch(/wrong or has expired/);
  });

  it("explains rate limits", () => {
    expect(friendlyAuthError({ code: "over_sms_send_rate_limit" })).toMatch(/Wait a minute/);
    expect(friendlyAuthError({ status: 429 })).toMatch(/Wait a minute/);
  });

  it("passes through the cooldown seconds", () => {
    expect(
      friendlyAuthError({ message: "For security purposes, you can only request this after 47 seconds." }),
    ).toBe("Wait 47 seconds before requesting another code.");
  });

  it("falls back to a generic instruction", () => {
    expect(friendlyAuthError({ code: "mystery" })).toMatch(/Try again/);
  });
});

import { formatDate, formatDateTime } from "./format";

describe("dates in Kenyan time", () => {
  it("keeps a plain date on its calendar day", () => {
    expect(formatDate("2026-10-19")).toBe("19 Oct 2026");
  });

  it("shows timestamps in Nairobi time", () => {
    // 21:30 UTC on the 18th is 00:30 on the 19th in Nairobi.
    expect(formatDate("2026-10-18T21:30:00Z")).toBe("19 Oct 2026");
    expect(formatDateTime("2026-10-19T14:53:00Z")).toBe("19 Oct, 17:53");
  });
});

import { dayLabel, formatTime, shortWhen } from "./format";

describe("chat times in Kenyan time", () => {
  const now = new Date("2026-10-19T12:00:00Z"); // 15:00 in Nairobi

  it("shows the time on a 24-hour clock", () => {
    expect(formatTime("2026-10-19T11:05:00Z")).toBe("14:05");
  });

  it("labels days relative to Nairobi midnight", () => {
    expect(dayLabel("2026-10-19T00:30:00Z", now)).toBe("Today");
    expect(dayLabel("2026-10-18T20:59:00Z", now)).toBe("Yesterday"); // 23:59 on the 18th in Nairobi
    expect(dayLabel("2026-10-18T21:01:00Z", now)).toBe("Today"); // 00:01 on the 19th in Nairobi
    expect(dayLabel("2026-10-10T09:00:00Z", now)).toBe("10 Oct 2026");
  });

  it("keeps inbox times short", () => {
    expect(shortWhen("2026-10-19T11:05:00Z", now)).toBe("14:05");
    expect(shortWhen("2026-10-01T11:05:00Z", now)).toBe("1 Oct");
  });
});
