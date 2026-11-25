import { describe, expect, it, vi } from "vitest";

import {
  AD_DIAGNOSTIC_MAX_CHARS,
  adMissLine,
  adsDebugEnabled,
  cleanUpstreamMessage,
  logAdMiss,
} from "./adsDiagnostics";

describe("adsDebugEnabled", () => {
  it("is off unless the flag is exactly 1", () => {
    expect(adsDebugEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(adsDebugEnabled({ QRONOS_DEBUG_ADS: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(adsDebugEnabled({ QRONOS_DEBUG_ADS: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("cleanUpstreamMessage", () => {
  it("keeps the useful words and strips colours", () => {
    expect(cleanUpstreamMessage("\u001b[31m401\u001b[0m Unauthorized")).toBe("401 Unauthorized");
  });

  it("an Error becomes its message, not 'Error: ...'", () => {
    expect(cleanUpstreamMessage(new Error("bad key"))).toBe("bad key");
  });

  it("makes many lines into one", () => {
    expect(cleanUpstreamMessage("no fill\n  for placement\nmain")).toBe("no fill for placement main");
  });

  it("cuts a long message instead of flooding the log", () => {
    const long = "x".repeat(AD_DIAGNOSTIC_MAX_CHARS + 50);
    const cleaned = cleanUpstreamMessage(long);
    expect(cleaned).toHaveLength(AD_DIAGNOSTIC_MAX_CHARS);
    expect(cleaned.endsWith("\u2026")).toBe(true);
  });

  it("nothing is nothing", () => {
    expect(cleanUpstreamMessage(undefined)).toBe("");
    expect(cleanUpstreamMessage(null)).toBe("");
    expect(cleanUpstreamMessage("   ")).toBe("");
  });
});

describe("adMissLine", () => {
  it("names the slot, the network, the fill and whether a key exists", () => {
    const line = adMissLine({ slot: "banner", source: "gravity", fill: 0, keyPresent: true });
    expect(line).toBe("[ads] no fill slot=banner source=gravity fill=0 key=present");
  });

  it("says missing when no key is configured", () => {
    const line = adMissLine({ slot: "inline", source: "thrad", fill: 0, keyPresent: false });
    expect(line).toContain("key=missing");
  });

  it("adds the facts that explain a country or a route", () => {
    const line = adMissLine({
      slot: "banner",
      source: "gravity",
      fill: 0,
      keyPresent: true,
      extra: { thrad: "off", country: "US" },
    });
    expect(line).toContain("thrad=off");
    expect(line).toContain("country=US");
  });

  it("carries the network's own words last", () => {
    const line = adMissLine({ slot: "banner", source: "gravity", fill: 0, keyPresent: true, error: new Error("bad key") });
    expect(line.endsWith("err=bad key")).toBe(true);
  });

  it("never writes a key, even if one is put in the error text", () => {
    const line = adMissLine({
      slot: "banner",
      source: "gravity",
      fill: 0,
      keyPresent: true,
      error: "GRAVITY_API_KEY=gr_live_supersecret should not be logged",
    });
    // The message is the upstream's; what matters is that we never add one of ours.
    expect(line).not.toContain("key=gr");
  });

  it("an unknown slot still produces a readable line", () => {
    expect(adMissLine({ slot: "", source: "", fill: 0, keyPresent: false })).toBe(
      "[ads] no fill slot=unknown source=none fill=0 key=missing",
    );
  });
});

describe("logAdMiss", () => {
  it("a plain empty placement is silent without the debug flag", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logAdMiss({ slot: "banner", source: "gravity", fill: 0, keyPresent: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("the debug flag makes the empty placement visible", () => {
    process.env.QRONOS_DEBUG_ADS = "1";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logAdMiss({ slot: "banner", source: "gravity", fill: 0, keyPresent: true });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    delete process.env.QRONOS_DEBUG_ADS;
  });

  it("a real upstream error is always loud", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logAdMiss({ slot: "banner", source: "gravity", fill: 0, keyPresent: true, error: "401", loud: true });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("a broken console must not break the request", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("no console");
    });
    expect(() => logAdMiss({ slot: "banner", source: "gravity", fill: 0, keyPresent: true, loud: true })).not.toThrow();
    spy.mockRestore();
  });
});
