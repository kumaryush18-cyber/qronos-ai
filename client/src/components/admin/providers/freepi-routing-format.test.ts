import { describe, expect, it } from "vitest";

import {
  clockLabel,
  durationLabel,
  shortModel,
  slotLabel,
  statusTone,
  tokensLabel,
} from "./freepi-routing-format";

describe("clockLabel", () => {
  it("is a fixed-width UTC time, so the column never jumps", () => {
    expect(clockLabel("2026-11-24T04:12:44.000Z")).toBe("04:12:44");
    expect(clockLabel("2026-11-24T00:00:01.000Z")).toBe("00:00:01");
  });

  it("nothing readable becomes the same width placeholder", () => {
    expect(clockLabel(null)).toBe("--:--:--");
    expect(clockLabel("nonsense")).toBe("--:--:--");
  });
});

describe("slotLabel", () => {
  it("counts from one for a person", () => {
    expect(slotLabel(0, "srv-1")).toBe("slot 1");
    expect(slotLabel(2, "srv-3")).toBe("slot 3");
  });

  it("an id with no slot number is shown as it is, never invented", () => {
    expect(slotLabel(null, "t1")).toBe("t1");
    expect(slotLabel(undefined, "srv-9")).toBe("srv-9");
  });
});

describe("shortModel", () => {
  it("leaves a short name alone", () => {
    expect(shortModel("particle")).toBe("particle");
    expect(shortModel("deepseek-v4-flash")).toBe("deepseek-v4-flash");
  });

  it("cuts a long name with an ellipsis so the counts stay in place", () => {
    const cut = shortModel("deepseek-v4.1-flash-very-long-name", 18);
    expect(cut).toHaveLength(18);
    expect(cut.endsWith("\u2026")).toBe(true);
    expect(cut.startsWith("deepseek")).toBe(true);
  });

  it("an empty name is empty, not a marker", () => {
    expect(shortModel("")).toBe("");
  });
});

describe("durationLabel", () => {
  it("milliseconds below a second, seconds above", () => {
    expect(durationLabel(840)).toBe("840ms");
    expect(durationLabel(1200)).toBe("1.2s");
    expect(durationLabel(12_400)).toBe("12s");
  });

  it("a missing or broken duration is a dash", () => {
    expect(durationLabel(null)).toBe("\u2014");
    expect(durationLabel(-5)).toBe("\u2014");
    expect(durationLabel(Number.NaN)).toBe("\u2014");
  });
});

describe("tokensLabel", () => {
  it("input then output, in one fixed shape", () => {
    expect(tokensLabel(412, 588)).toBe("412 / 588");
  });

  it("a count the service did not send is a dash, never a zero", () => {
    expect(tokensLabel(null, 588)).toBe("\u2014 / 588");
    expect(tokensLabel(412, null)).toBe("412 / \u2014");
    expect(tokensLabel(null, null)).toBe("\u2014 / \u2014");
    expect(tokensLabel(0, 0)).toBe("0 / 0");
  });
});

describe("statusTone", () => {
  it("lime for a real answer", () => {
    expect(statusTone(200)).toBe("good");
    expect(statusTone(204)).toBe("good");
  });

  it("pale orange for a wait, red for a failure", () => {
    expect(statusTone(429)).toBe("warn");
    expect(statusTone(408)).toBe("warn");
    expect(statusTone(500)).toBe("bad");
    expect(statusTone(401)).toBe("bad");
  });

  it("a request that never left is red, and no status at all is idle", () => {
    expect(statusTone(0)).toBe("bad");
    expect(statusTone(null)).toBe("idle");
  });
});
