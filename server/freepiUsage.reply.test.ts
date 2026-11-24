import { describe, expect, it } from "vitest";

import { composeFreepiUsageReply, type FreepiUsageRow } from "./freepiUsage";

const READY: FreepiUsageRow = {
  slot: 0,
  label: "main",
  fingerprint: "e2632c",
  ok: true,
  remaining: 3990,
  allowance: 4000,
  tier: "established",
  lane: "standard",
  refillAt: "2026-11-25T00:00:00.000Z",
  promptTokensToday: 168,
  completionTokensToday: 45,
  lifetimePromptTokens: 60_816_947,
  checkedAt: "2026-11-24T04:00:00.000Z",
  cached: true,
};

const DEAD: FreepiUsageRow = {
  slot: 1,
  label: null,
  fingerprint: "aa11bb",
  ok: false,
  reason: "revoked",
  remaining: null,
  allowance: null,
  tier: null,
  lane: null,
  refillAt: null,
  promptTokensToday: null,
  completionTokensToday: null,
  lifetimePromptTokens: null,
  checkedAt: "2026-11-24T04:00:00.000Z",
  cached: false,
};

describe("composeFreepiUsageReply", () => {
  it("carries the cache duration so the panel can say it", () => {
    expect(composeFreepiUsageReply([READY]).cacheMinutes).toBe(30);
  });

  it("one row per slot, in order", () => {
    const reply = composeFreepiUsageReply([READY, DEAD]);
    expect(reply.slots.map((row) => row.slot)).toEqual([0, 1]);
  });

  it("a dead slot is a row with a reason, never a broken reply", () => {
    const reply = composeFreepiUsageReply([DEAD]);
    expect(reply.slots[0]).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("a missing number stays null, so the panel shows a dash", () => {
    const reply = composeFreepiUsageReply([{ ...READY, remaining: null, allowance: null }]);
    expect(reply.slots[0]!.remaining).toBeNull();
    expect(reply.slots[0]!.allowance).toBeNull();
  });

  it("an extra field on a row can never reach a browser", () => {
    const leaky = { ...READY, token: "eyJ-secret-value", iv: "abc", authTag: "def" } as FreepiUsageRow;
    const reply = composeFreepiUsageReply([leaky]);
    expect(Object.keys(reply.slots[0]!).sort()).toEqual(
      [
        "allowance",
        "cached",
        "checkedAt",
        "completionTokensToday",
        "fingerprint",
        "label",
        "lane",
        "lifetimePromptTokens",
        "ok",
        "promptTokensToday",
        "refillAt",
        "remaining",
        "slot",
        "tier",
      ].sort(),
    );
    expect(JSON.stringify(reply)).not.toContain("eyJ");
  });

  it("an empty pool is an empty list, not an error", () => {
    expect(composeFreepiUsageReply([])).toEqual({ cacheMinutes: 30, slots: [] });
  });
});
