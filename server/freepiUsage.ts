// What is left in each shared token account, for the admin panel.
//
// The numbers come from the provider's own stats route, the same one its own CLI
// reads. A daily allowance does not change every minute, so the snapshot is
// cached for half an hour; a per-slot Refresh button forces one live read, with a
// short floor so the button cannot be spammed.
//
// Rules:
//  - a token is never returned, logged or put in an error;
//  - one bad token marks *that* slot, it never blanks the whole panel;
//  - a missing number stays missing: `null`, never a guess.
import { loadFreepiCredentialSlotCiphertexts } from "./db";
import { decryptFreepiCredential, freepiTokenFingerprint, freepiFingerprintSuffix } from "./freepiCredentialVault";

/** The provider's own stats route. It spends no model allowance. */
export const FREEPI_USAGE_URL = "https://api.freepi.ai/me/stats";

/** A daily allowance is not a live stock price. Half an hour is plenty. */
export const FREEPI_USAGE_CACHE_MS = 30 * 60 * 1000;

/** The floor between two forced reads of the same slot. */
export const FREEPI_USAGE_FORCED_FLOOR_MS = 20 * 1000;

export type FreepiUsageReason = "revoked" | "unreachable" | "bad-shape";

export interface FreepiUsageReading {
  ok: boolean;
  reason?: FreepiUsageReason;
  /** Credits left today, or null when the provider did not say. */
  remaining: number | null;
  /** Today's allowance, or null. */
  allowance: number | null;
  tier: string | null;
  lane: string | null;
  refillAt: string | null;
  promptTokensToday: number | null;
  completionTokensToday: number | null;
  lifetimePromptTokens: number | null;
}

export interface FreepiUsageRow extends FreepiUsageReading {
  slot: number;
  label: string | null;
  /** Six characters of a one-way digest. Enough to match a row, useless as a secret. */
  fingerprint: string;
  /** When this reading was taken, in ISO form. */
  checkedAt: string;
  /** True when the reading came from the cache instead of a live call. */
  cached: boolean;
}

export type FetchImpl = typeof fetch;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Read one account's stats. Never throws: every failure is one honest reason. */
export async function fetchFreepiUsage(
  token: string,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<FreepiUsageReading> {
  const empty = (reason: FreepiUsageReason): FreepiUsageReading => ({
    ok: false,
    reason,
    remaining: null,
    allowance: null,
    tier: null,
    lane: null,
    refillAt: null,
    promptTokensToday: null,
    completionTokensToday: null,
    lifetimePromptTokens: null,
  });

  const normalized = token.trim();
  if (!normalized) return empty("revoked");

  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(FREEPI_USAGE_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${normalized}`, Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
  } catch {
    return empty("unreachable");
  }

  if (response.status === 401 || response.status === 403) return empty("revoked");
  if (!response.ok) return empty("unreachable");

  let body: Record<string, unknown> | undefined;
  try {
    const parsed = await response.json();
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return empty("bad-shape");
  }
  if (!body) return empty("bad-shape");

  const lifetime = (body.lifetime ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    remaining: numberOrNull(body.remaining_credits_today),
    allowance: numberOrNull(body.allowance_credits),
    tier: textOrNull(body.tier),
    lane: textOrNull(body.lane),
    refillAt: textOrNull(body.refill_at),
    promptTokensToday: numberOrNull(body.prompt_tokens_today),
    completionTokensToday: numberOrNull(body.completion_tokens_today),
    lifetimePromptTokens: numberOrNull(lifetime.prompt_tokens),
  };
}

/** One decrypted slot, the smallest thing the snapshot needs. */
export type UsageSlot = { slot: number; label: string | null; token: string };

const cache = new Map<number, { at: number; row: FreepiUsageRow }>();
let lastForced = new Map<number, number>();

/** Forget everything. For tests, and after a token is saved or removed. */
export function invalidateFreepiUsageCache(slot?: number): void {
  if (slot === undefined) {
    cache.clear();
    lastForced = new Map();
    return;
  }
  cache.delete(slot);
  lastForced.delete(slot);
}

export interface UsageSnapshotDeps {
  /** Seam for tests: the decrypted slots. */
  slots?: () => Promise<UsageSlot[]>;
  /** Seam for tests: the network. */
  fetchImpl?: FetchImpl;
  now?: () => number;
}

async function defaultSlots(): Promise<UsageSlot[]> {
  const rows = await loadFreepiCredentialSlotCiphertexts();
  const out: UsageSlot[] = [];
  for (const row of rows) {
    try {
      out.push({
        slot: row.slot,
        label: (row as { label?: string | null }).label ?? null,
        token: decryptFreepiCredential(row),
      });
    } catch {
      // An undecryptable row is not a usage row; the panel already flags it.
    }
  }
  return out;
}

async function readSlot(slot: UsageSlot, deps: UsageSnapshotDeps): Promise<FreepiUsageRow> {
  const reading = await fetchFreepiUsage(slot.token, { fetchImpl: deps.fetchImpl });
  const now = (deps.now ?? Date.now)();
  return {
    ...reading,
    slot: slot.slot,
    label: slot.label ?? null,
    fingerprint: freepiFingerprintSuffix(freepiTokenFingerprint(slot.token)),
    checkedAt: new Date(now).toISOString(),
    cached: false,
  };
}

/**
 * The snapshot: one row per slot, each no older than the cache window.
 *
 * Only the slots that are missing or stale are read, so a second panel reload
 * costs nothing. A slot that fails keeps its previous numbers but is marked with
 * the reason, so the panel never shows a stale number as if it were fresh.
 */
export async function getFreepiUsageSnapshot(deps: UsageSnapshotDeps = {}): Promise<FreepiUsageRow[]> {
  const now = (deps.now ?? Date.now)();
  const slots = await (deps.slots ?? defaultSlots)();
  const rows: FreepiUsageRow[] = [];

  const results = await Promise.all(
    slots.map(async (slot) => {
      const hit = cache.get(slot.slot);
      if (hit && now - hit.at < FREEPI_USAGE_CACHE_MS) {
        return { ...hit.row, cached: true };
      }
      const row = await readSlot(slot, deps);
      if (row.ok) cache.set(slot.slot, { at: now, row });
      else {
        const previous = cache.get(slot.slot);
        if (previous) return { ...previous.row, ...row, cached: true };
        cache.delete(slot.slot);
      }
      return row;
    }),
  );

  for (const row of results) rows.push(row);
  rows.sort((a, b) => a.slot - b.slot);
  return rows;
}

export type RefreshResult =
  | { ok: true; row: FreepiUsageRow }
  | { ok: false; reason: "too-soon" | "no-slot"; row?: FreepiUsageRow };

/**
 * Read one slot now, ignoring the cache.
 *
 * The floor protects us from a held-down button: inside it, the answer is the
 * reading we already have, marked `too-soon` so the panel can say so.
 */
export async function refreshFreepiUsage(
  slot: number,
  deps: UsageSnapshotDeps = {},
): Promise<RefreshResult> {
  const now = (deps.now ?? Date.now)();
  const slots = await (deps.slots ?? defaultSlots)();
  const wanted = slots.find((entry) => entry.slot === slot);
  if (!wanted) return { ok: false, reason: "no-slot" };

  const last = lastForced.get(slot) ?? 0;
  if (now - last < FREEPI_USAGE_FORCED_FLOOR_MS) {
    const hit = cache.get(slot);
    return { ok: false, reason: "too-soon", row: hit ? { ...hit.row, cached: true } : undefined };
  }
  lastForced.set(slot, now);

  const row = await readSlot(wanted, deps);
  if (row.ok) cache.set(slot, { at: now, row });
  return { ok: true, row };
}

/** Read every slot now, ignoring the cache. For "Refresh all". */
export async function refreshAllFreepiUsage(deps: UsageSnapshotDeps = {}): Promise<FreepiUsageRow[]> {
  const slots = await (deps.slots ?? defaultSlots)();
  const now = (deps.now ?? Date.now)();
  for (const slot of slots) lastForced.set(slot.slot, now);
  const rows = await Promise.all(slots.map((slot) => readSlot(slot, deps)));
  for (const row of rows) if (row.ok) cache.set(row.slot, { at: now, row });
  rows.sort((a, b) => a.slot - b.slot);
  return rows;
}

/**
 * The exact fields a panel row may carry.
 *
 * A whitelist, not a copy: whatever a row grows later, a key can never reach a
 * browser through this reply by accident.
 */
const REPLY_FIELDS = [
  "slot",
  "label",
  "fingerprint",
  "ok",
  "reason",
  "remaining",
  "allowance",
  "tier",
  "lane",
  "refillAt",
  "promptTokensToday",
  "completionTokensToday",
  "lifetimePromptTokens",
  "checkedAt",
  "cached",
] as const;

const pick = (row: FreepiUsageRow): FreepiUsageRow => {
  const out: Record<string, unknown> = {};
  for (const field of REPLY_FIELDS) {
    if (field in row) out[field] = (row as unknown as Record<string, unknown>)[field];
  }
  return out as unknown as FreepiUsageRow;
};

/** What the admin panel receives: a duration and a whitelisted row per slot. */
export function composeFreepiUsageReply(
  rows: FreepiUsageRow[],
  cacheMinutes: number = FREEPI_USAGE_CACHE_MS / 60_000,
): { cacheMinutes: number; slots: FreepiUsageRow[] } {
  return { cacheMinutes, slots: rows.map(pick) };
}

