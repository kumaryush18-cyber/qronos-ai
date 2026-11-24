import { loadFreepiCredentialSlotCiphertexts, setFreepiCredentialSlot } from "./db";
import { decryptFreepiCredential, freepiFingerprintSuffix, freepiTokenFingerprint } from "./freepiCredentialVault";

/**
 * How many free-pi tokens the panel can hold.
 *
 * free-pi allows one live request per token, so more tokens only ever help by
 * letting two people wait less. Eight is a comfortable pool that still fits on
 * one admin screen.
 */
export const FREEPI_CREDENTIAL_POOL_SIZE = 8;

/** Shortest plausible free-pi token. A JWT is far longer; a fragment is not a token. */
export const FREEPI_MIN_TOKEN_LENGTH = 20;

/**
 * Where a token is checked.
 *
 * `GET /ads/next` is free (it spends no model tokens) and answers 401 for a bad
 * token, so "is this token real?" costs nothing. A 2xx means accepted.
 */
export const FREEPI_VALIDATION_URL = "https://api.freepi.ai/ads/next?slot=banner";

/** Long enough that two CLI starts do not mean two database reads. */
const POOL_CACHE_MS = 60_000;

export type FreepiCredentialSelection = { token: string; slot: number; label: string | null };

let cachedPool: { expiresAt: number; entries: FreepiCredentialSelection[] } | null = null;

/** Forget the cached pool. Called after any admin change to the slots. */
export function invalidateFreepiCredentialPool(): void {
  cachedPool = null;
}

export type ValidateFreepiOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Check one token against free-pi.
 *
 * Throws a plain sentence when the token is refused or cannot be checked. It
 * never returns false: a caller that forgets to check a boolean is a bug
 * waiting to happen, an exception is not.
 */
export async function validateFreepiCredential(
  token: string,
  options: ValidateFreepiOptions = {},
): Promise<void> {
  const normalized = token.trim();
  if (normalized.length < FREEPI_MIN_TOKEN_LENGTH) {
    throw new Error("Enter a complete free-pi token");
  }
  if (/[\r\n]/.test(normalized)) {
    throw new Error("A free-pi token cannot contain a line break");
  }
  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(FREEPI_VALIDATION_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${normalized}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch {
    // Never echo the fetch error: some runtimes put the request URL in it.
    throw new Error("Could not reach free-pi to check this token. Nothing was saved.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("free-pi refused this token. It may be expired or copied incorrectly.");
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(`free-pi could not confirm this token (HTTP ${response.status}). Nothing was saved.`);
  }
}

/**
 * The decrypted pool, newest read cached for a minute.
 *
 * A row that cannot be decrypted is skipped, not fatal: a rotated
 * `JWT_SECRET` must not break every other token, and the panel already shows
 * which rows need re-entering.
 */
export async function getFreepiCredentialPool(
  now: () => number = Date.now,
): Promise<FreepiCredentialSelection[]> {
  const current = now();
  if (cachedPool && cachedPool.expiresAt > current) return cachedPool.entries;

  let rows: Awaited<ReturnType<typeof loadFreepiCredentialSlotCiphertexts>> = [];
  try {
    rows = await loadFreepiCredentialSlotCiphertexts();
  } catch {
    return [];
  }

  const entries: FreepiCredentialSelection[] = [];
  for (const row of rows) {
    try {
      entries.push({
        token: decryptFreepiCredential(row),
        slot: row.slot,
        label: (row as { label?: string | null }).label ?? null,
      });
    } catch {
      // Undecryptable row: skip it. The panel says "re-add this token".
    }
  }
  cachedPool = { expiresAt: current + POOL_CACHE_MS, entries };
  return entries;
}

/** The one sentence a CLI shows when the pool already holds eight tokens. */
export const FREEPI_POOL_FULL_MESSAGE =
  "The free-pi token pool is full. Ask a Qronos admin to remove one in the admin panel.";

/**
 * The lowest slot that holds nothing.
 *
 * The pool must never grow by accident, so the numbering is fixed: slot 0 is
 * always tried first, and only a free slot is ever written by a CLI.
 */
export function findNextFreeFreepiSlot(
  usedSlots: readonly number[],
  poolSize: number = FREEPI_CREDENTIAL_POOL_SIZE,
): number | null {
  const used = new Set(usedSlots);
  for (let slot = 0; slot < poolSize; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

/**
 * The slot that already holds this exact token, if any.
 *
 * Both sides are secrets that never leave this function, so a plain comparison
 * is enough; the result is a slot number, never the token.
 */
export function findDuplicateFreepiSlot(
  token: string,
  entries: readonly FreepiCredentialSelection[],
): number | null {
  const wanted = token.trim();
  for (const entry of entries) {
    if (entry.token === wanted) return entry.slot;
  }
  return null;
}

export type SaveFreepiCredentialResult =
  | { ok: true; slot: number; fingerprint: string; duplicate: boolean }
  | { ok: false; reason: "full" | "unavailable"; message: string };

export type SaveFreepiCredentialDeps = {
  /** Seam for tests: the free-pi check. Throws a plain sentence when refused. */
  validate?: (token: string) => Promise<void>;
  /** Seam for tests: the slots that already exist. */
  listSlots?: () => Promise<Array<{ slot: number }>>;
  /** Seam for tests: decrypting the pool, for the duplicate check. */
  pool?: () => Promise<FreepiCredentialSelection[]>;
  /** Seam for tests: the write itself. */
  save?: (input: { slot: number; token: string; label?: string | null; updatedByUserId: number }) => Promise<unknown>;
  fetchImpl?: typeof fetch;
};

/**
 * Add one token to the pool, in the lowest free slot.
 *
 * Rules:
 *  - the token is checked with free-pi before anything is written;
 *  - an existing slot is never replaced, so one user cannot destroy another
 *    user's token by signing in again;
 *  - the same token is never stored twice;
 *  - a full pool is a clear refusal, not a silent overwrite.
 */
export async function saveFreepiCredential(
  input: { token: string; label?: string | null; userId: number },
  deps: SaveFreepiCredentialDeps = {},
): Promise<SaveFreepiCredentialResult> {
  const token = input.token.trim();
  const validate = deps.validate ?? ((value: string) => validateFreepiCredential(value, { fetchImpl: deps.fetchImpl }));
  const listSlots = deps.listSlots ?? (() => loadFreepiCredentialSlotCiphertexts().then((rows) => rows.map((row) => ({ slot: row.slot }))));
  const pool = deps.pool ?? (() => getFreepiCredentialPool());
  const save = deps.save ?? setFreepiCredentialSlot;

  await validate(token);

  const existing = await pool();
  const duplicateSlot = findDuplicateFreepiSlot(token, existing);
  if (duplicateSlot !== null) {
    const entry = existing.find((candidate) => candidate.slot === duplicateSlot);
    return {
      ok: true,
      slot: duplicateSlot,
      fingerprint: entry ? freepiFingerprintSuffix(freepiTokenFingerprint(entry.token)) : freepiFingerprintSuffix(freepiTokenFingerprint(token)),
      duplicate: true,
    };
  }

  const free = findNextFreeFreepiSlot((await listSlots()).map((row) => row.slot));
  if (free === null) {
    return { ok: false, reason: "full", message: FREEPI_POOL_FULL_MESSAGE };
  }

  await save({ slot: free, token, label: input.label ?? null, updatedByUserId: input.userId });
  invalidateFreepiCredentialPool();
  return { ok: true, slot: free, fingerprint: freepiFingerprintSuffix(freepiTokenFingerprint(token)), duplicate: false };
}

/** Round-robin pick, used later by the proxy phase. Kept here so the order lives in one place. */
export function selectNextFreepiCredential(
  entries: readonly FreepiCredentialSelection[],
  cursor: number,
): { entry: FreepiCredentialSelection; nextCursor: number } | undefined {
  if (entries.length === 0) return undefined;
  const index = cursor % entries.length;
  return { entry: entries[index]!, nextCursor: (index + 1) % entries.length };
}
