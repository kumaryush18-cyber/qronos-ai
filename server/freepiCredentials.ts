import { loadFreepiCredentialSlotCiphertexts } from "./db";
import { decryptFreepiCredential } from "./freepiCredentialVault";

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

/** Round-robin pick, used later by the proxy phase. Kept here so the order lives in one place. */
export function selectNextFreepiCredential(
  entries: readonly FreepiCredentialSelection[],
  cursor: number,
): { entry: FreepiCredentialSelection; nextCursor: number } | undefined {
  if (entries.length === 0) return undefined;
  const index = cursor % entries.length;
  return { entry: entries[index]!, nextCursor: (index + 1) % entries.length };
}
