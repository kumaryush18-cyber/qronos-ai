import { describe, expect, it } from "vitest";

import {
  AD_MESSAGE_MAX_CHARS,
  decodeMessagesHeader,
  emailHashOf,
  encodeMessagesHeader,
  hashEmail,
  placementConfig,
  realDevice,
  countryFrom,
  sanitizeMessages,
} from "./adRequest";

describe("placement ids", () => {
  it("uses the ids that exist in the dashboard", () => {
    expect(placementConfig("cli", "banner", {}).placement_id).toBe("Qronos-CLI-Banner");
    expect(placementConfig("cli", "inline", {}).placement_id).toBe("Qronos-CLI-Inline-card");
    expect(placementConfig("web", "banner", {}).placement_id).toBe("Qronos-AI-Below-response");
    expect(placementConfig("web", "inline", {}).placement_id).toBe("Qronos-AI-Inline-response");
  });

  it("matches the placement type the dashboard holds", () => {
    expect(placementConfig("cli", "banner", {}).placement).toBe("below_response");
    expect(placementConfig("cli", "inline", {}).placement).toBe("inline_response");
  });

  it("lets an env var rename a placement without a release", () => {
    const config = placementConfig("cli", "banner", { GRAVITY_PLACEMENT_CLI_BANNER: "custom-id" });
    expect(config.placement_id).toBe("custom-id");
  });

  it("keeps a terminal ad short, and leaves the web unlimited", () => {
    expect(placementConfig("cli", "banner", {}).max_ad_text_chars).toBe(160);
    expect(placementConfig("web", "banner", {}).max_ad_text_chars).toBeUndefined();
  });

  it("never returns an empty id when an env var is blank", () => {
    expect(placementConfig("cli", "inline", { GRAVITY_PLACEMENT_CLI_INLINE: "   " }).placement_id).toBe(
      "Qronos-CLI-Inline-card",
    );
  });

  it("falls back to the CLI banner for an unknown surface", () => {
    expect(placementConfig("browser", "sidebar", {}).placement_id).toBe("Qronos-CLI-Banner");
  });
});

describe("the conversation we send", () => {
  it("keeps user and assistant turns in order", () => {
    const out = sanitizeMessages([
      { role: "user", content: "why is my build slow" },
      { role: "assistant", content: "your test suite runs twice" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("drops a role it does not accept", () => {
    expect(sanitizeMessages([{ role: "system", content: "be nice" }])).toEqual([]);
  });

  it("strips terminal colour codes, so a creative never reads like a log", () => {
    const out = sanitizeMessages([{ role: "user", content: "\u001b[31mred\u001b[0m text" }]);
    expect(out[0]!.content).toBe("red text");
  });

  it("cuts only an absurdly long message, and says so", () => {
    const long = "x".repeat(AD_MESSAGE_MAX_CHARS + 500);
    const out = sanitizeMessages([{ role: "user", content: long }]);
    expect(out[0]!.content.length).toBe(AD_MESSAGE_MAX_CHARS);
    expect(out[0]!.content.endsWith("…")).toBe(true);
  });

  it("keeps the real paragraph, not a 500-character stump", () => {
    const paragraph = "a".repeat(900);
    const out = sanitizeMessages([{ role: "user", content: paragraph }]);
    expect(out[0]!.content).toHaveLength(900);
  });

  it("drops empty turns and junk", () => {
    expect(
      sanitizeMessages([{ role: "user", content: "   " }, null, { role: "assistant" }, { role: "user", content: "ok" }]),
    ).toEqual([{ role: "user", content: "ok" }]);
  });

  it("travels as a header and comes back unchanged", () => {
    const messages = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    expect(decodeMessagesHeader(encodeMessagesHeader(messages))).toEqual(messages);
  });

  it("treats a broken header as no conversation", () => {
    expect(decodeMessagesHeader("not-json")).toEqual([]);
    expect(decodeMessagesHeader(undefined)).toEqual([]);
  });
});

describe("the identity we send", () => {
  it("accepts a 64-character hex hash", () => {
    const hash = "a".repeat(64);
    expect(emailHashOf(hash)).toBe(hash);
  });

  it("refuses an email address sent by mistake, so no address is ever stored", () => {
    expect(emailHashOf("someone@example.com")).toBeUndefined();
    expect(emailHashOf("short")).toBeUndefined();
  });

  it("hashes the way Gravity does: trim, lowercase, sha256", () => {
    const a = hashEmail("  Someone@Example.COM ");
    const b = hashEmail("someone@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a value that is not an address", () => {
    expect(hashEmail("nodev")).toBeUndefined();
    expect(hashEmail(undefined)).toBeUndefined();
  });
});

describe("the device block", () => {
  it("builds the user agent from the client's own headers", () => {
    const device = realDevice(
      { "x-client-os": "darwin", "x-client-arch": "arm64", "x-client-version": "1.0.30" },
      "203.0.113.4",
    );
    expect(device.ua).toBe("qronos-cli/1.0.30 (darwin; arm64)");
    expect(device.os).toBe("darwin");
    expect(device.arch).toBe("arm64");
    expect(device.ip).toBe("203.0.113.4");
  });

  it("falls back to the real browser user agent", () => {
    const device = realDevice({ "user-agent": "Mozilla/5.0 (X11; Linux x86_64)" }, undefined);
    expect(device.ua).toContain("Mozilla/5.0");
  });

  it("cuts a user agent that is trying to be a payload", () => {
    expect(realDevice({ "user-agent": "y".repeat(900) }, undefined).ua).toHaveLength(200);
  });

  it("takes a country only from the edge header", () => {
    expect(countryFrom({ "cf-ipcountry": "in" })).toBe("IN");
    expect(countryFrom({})).toBeUndefined();
    expect(countryFrom({ "cf-ipcountry": "not-a-country" })).toBeUndefined();
  });
});
