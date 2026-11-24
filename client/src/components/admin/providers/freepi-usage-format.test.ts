import { describe, expect, it } from "vitest";

import { ageLabel, creditShare, creditTone, fmtCredits, refillLabel } from "./freepi-usage-format";

describe("fmtCredits", () => {
  it("groups thousands so a large number is readable", () => {
    expect(fmtCredits(3990)).toBe("3,990");
    expect(fmtCredits(4000)).toBe("4,000");
  });

  it("a missing or broken number is a dash, never a zero", () => {
    expect(fmtCredits(null)).toBe("—");
    expect(fmtCredits(undefined)).toBe("—");
    expect(fmtCredits(Number.NaN)).toBe("—");
    expect(fmtCredits(0)).toBe("0");
  });
});

describe("creditShare", () => {
  it("is the part still there", () => {
    expect(creditShare(3990, 4000)).toBeCloseTo(0.9975, 4);
  });

  it("a zero allowance is no share at all, not a division by zero", () => {
    expect(creditShare(0, 0)).toBeNull();
    expect(creditShare(10, null)).toBeNull();
    expect(creditShare(null, 4000)).toBeNull();
  });

  it("can never leave 0..1, even if the service overshoots", () => {
    expect(creditShare(5000, 4000)).toBe(1);
    expect(creditShare(-5, 4000)).toBe(0);
  });
});

describe("creditTone", () => {
  it("lime, pale orange when low, red when empty", () => {
    expect(creditTone(0.9)).toBe("good");
    expect(creditTone(0.2)).toBe("good");
    expect(creditTone(0.19)).toBe("low");
    expect(creditTone(0)).toBe("empty");
  });

  it("no share is not an alarm", () => {
    expect(creditTone(null)).toBe("good");
  });
});

describe("refillLabel", () => {
  it("is short and in UTC so two admins read the same time", () => {
    expect(refillLabel("2026-11-25T00:00:00.000Z")).toBe("25 Nov 00:00 UTC");
  });

  it("nothing or nonsense is null", () => {
    expect(refillLabel(null)).toBeNull();
    expect(refillLabel("not a date")).toBeNull();
  });
});

describe("ageLabel", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z");

  it("a fresh read says so", () => {
    expect(ageLabel("2026-11-24T11:59:40.000Z", now)).toBe("checked just now");
  });

  it("minutes, then hours, then days", () => {
    expect(ageLabel("2026-11-24T11:55:00.000Z", now)).toBe("checked 5m ago");
    expect(ageLabel("2026-11-24T09:00:00.000Z", now)).toBe("checked 3h ago");
    expect(ageLabel("2026-11-20T12:00:00.000Z", now)).toBe("checked 4d ago");
  });

  it("a broken timestamp still reads as a sentence", () => {
    expect(ageLabel("nonsense", now)).toBe("checked —");
    expect(ageLabel(null, now)).toBe("checked —");
  });
});
