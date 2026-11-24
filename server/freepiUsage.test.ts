import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FREEPI_USAGE_CACHE_MS,
  FREEPI_USAGE_FORCED_FLOOR_MS,
  FREEPI_USAGE_URL,
  fetchFreepiUsage,
  getFreepiUsageSnapshot,
  invalidateFreepiUsageCache,
  refreshAllFreepiUsage,
  refreshFreepiUsage,
  type UsageSlot,
} from "./freepiUsage";

const TOKEN_A = "eyJ-slot-a-token-value-1234567890";
const TOKEN_B = "eyJ-slot-b-token-value-1234567890";

const SLOTS: UsageSlot[] = [
  { slot: 0, label: "main", token: TOKEN_A },
  { slot: 1, label: null, token: TOKEN_B },
];

function statsBody(overrides: Record<string, unknown> = {}) {
  return {
    tier: "established",
    lane: "standard",
    allowance_credits: 4000,
    remaining_credits_today: 3990,
    refill_at: "2026-11-25T00:00:00.000Z",
    prompt_tokens_today: 168,
    completion_tokens_today: 45,
    lifetime: { prompt_tokens: 60816947 },
    ...overrides,
  };
}

function fakeFetch(responses: Array<{ status?: number; body?: unknown; throw?: boolean }>) {
  let call = 0;
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    if (spec.throw) throw new Error("network down");
    return new Response(spec.body === undefined ? "" : JSON.stringify(spec.body), { status: spec.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

beforeEach(() => {
  invalidateFreepiUsageCache();
});

describe("fetchFreepiUsage", () => {
  it("reads the provider's own stats route and maps the numbers", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: statsBody() }]);
    const reading = await fetchFreepiUsage(TOKEN_A, { fetchImpl });
    expect(calls()[0]).toBe(FREEPI_USAGE_URL);
    expect(reading).toMatchObject({
      ok: true,
      remaining: 3990,
      allowance: 4000,
      tier: "established",
      lane: "standard",
      refillAt: "2026-11-25T00:00:00.000Z",
      promptTokensToday: 168,
      completionTokensToday: 45,
      lifetimePromptTokens: 60816947,
    });
  });

  it("401 means this token is no longer accepted", async () => {
    const { fetchImpl } = fakeFetch([{ status: 401 }]);
    expect((await fetchFreepiUsage(TOKEN_A, { fetchImpl })).reason).toBe("revoked");
  });

  it("a network failure is unreachable, never a thrown error", async () => {
    const { fetchImpl } = fakeFetch([{ throw: true }]);
    const reading = await fetchFreepiUsage(TOKEN_A, { fetchImpl });
    expect(reading.ok).toBe(false);
    expect(reading.reason).toBe("unreachable");
    expect(JSON.stringify(reading)).not.toContain(TOKEN_A);
  });

  it("a body without numbers keeps null, never a guess", async () => {
    const { fetchImpl } = fakeFetch([{ body: { tier: "established" } }]);
    const reading = await fetchFreepiUsage(TOKEN_A, { fetchImpl });
    expect(reading.ok).toBe(true);
    expect(reading.remaining).toBeNull();
    expect(reading.allowance).toBeNull();
  });
});

describe("getFreepiUsageSnapshot", () => {
  it("one row per slot, sorted, with a six-character fingerprint", async () => {
    const { fetchImpl } = fakeFetch([{ body: statsBody() }]);
    const rows = await getFreepiUsageSnapshot({ slots: async () => SLOTS, fetchImpl });
    expect(rows.map((row) => row.slot)).toEqual([0, 1]);
    expect(rows[0]!.fingerprint).toHaveLength(6);
    expect(JSON.stringify(rows)).not.toContain(TOKEN_A);
  });

  it("a second call inside the window costs no request", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: statsBody() }]);
    let now = 1_000_000;
    const options = { slots: async () => SLOTS, fetchImpl, now: () => now };
    await getFreepiUsageSnapshot(options);
    const first = calls().length;
    now += 60_000;
    const rows = await getFreepiUsageSnapshot(options);
    expect(calls().length).toBe(first);
    expect(rows[0]!.cached).toBe(true);
  });

  it("the cache expires after thirty minutes", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: statsBody() }]);
    let now = 1_000_000;
    const options = { slots: async () => SLOTS, fetchImpl, now: () => now };
    await getFreepiUsageSnapshot(options);
    const first = calls().length;
    now += FREEPI_USAGE_CACHE_MS + 1;
    await getFreepiUsageSnapshot(options);
    expect(calls().length).toBeGreaterThan(first);
  });

  it("one refused token never hides the other slots", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
      if (auth.includes(TOKEN_A)) return new Response("", { status: 401 });
      return new Response(JSON.stringify(statsBody()), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await getFreepiUsageSnapshot({ slots: async () => SLOTS, fetchImpl });
    expect(rows[0]).toMatchObject({ slot: 0, ok: false, reason: "revoked" });
    expect(rows[1]).toMatchObject({ slot: 1, ok: true, remaining: 3990 });
  });
});

describe("refreshFreepiUsage", () => {
  it("a forced read ignores the cache for that slot only", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: statsBody() }]);
    let now = 1_000_000;
    const deps = { slots: async () => SLOTS, fetchImpl, now: () => now };
    await getFreepiUsageSnapshot(deps);
    const before = calls().length;
    now += 25_000;
    const result = await refreshFreepiUsage(0, deps);
    expect(result.ok).toBe(true);
    expect(calls().length).toBe(before + 1);
  });

  it("inside the floor the answer is the reading we already have", async () => {
    const { fetchImpl } = fakeFetch([{ body: statsBody() }]);
    let now = 1_000_000;
    const deps = { slots: async () => SLOTS, fetchImpl, now: () => now };
    await refreshFreepiUsage(0, deps);
    now += FREEPI_USAGE_FORCED_FLOOR_MS - 1;
    const again = await refreshFreepiUsage(0, deps);
    expect(again).toMatchObject({ ok: false, reason: "too-soon" });
  });

  it("a slot that holds nothing answers no-slot", async () => {
    const { fetchImpl } = fakeFetch([{ body: statsBody() }]);
    const result = await refreshFreepiUsage(5, { slots: async () => SLOTS, fetchImpl });
    expect(result).toEqual({ ok: false, reason: "no-slot" });
  });
});

describe("refreshAllFreepiUsage", () => {
  it("reads every slot and skips the cache", async () => {
    const { fetchImpl, calls } = fakeFetch([{ body: statsBody() }]);
    const deps = { slots: async () => SLOTS, fetchImpl };
    await getFreepiUsageSnapshot(deps);
    const before = calls().length;
    const rows = await refreshAllFreepiUsage(deps);
    expect(rows).toHaveLength(2);
    expect(calls().length).toBe(before + 2);
  });
});

describe("no token is ever logged or returned", () => {
  it("every path is silent", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "error")];
    const { fetchImpl } = fakeFetch([{ status: 401 }]);
    await getFreepiUsageSnapshot({ slots: async () => SLOTS, fetchImpl });
    await refreshAllFreepiUsage({ slots: async () => SLOTS, fetchImpl });
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
