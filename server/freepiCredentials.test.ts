import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  loadFreepiCredentialSlotCiphertexts: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import {
  FREEPI_CREDENTIAL_POOL_SIZE,
  FREEPI_MIN_TOKEN_LENGTH,
  getFreepiCredentialPool,
  invalidateFreepiCredentialPool,
  selectNextFreepiCredential,
  validateFreepiCredential,
} from "./freepiCredentials";
import { encryptFreepiCredential } from "./freepiCredentialVault";

const TOKEN_ONE = "eyJhbGciOiJIUzI1NiJ9.token-one-for-the-pool.signature-one";
const TOKEN_TWO = "eyJhbGciOiJIUzI1NiJ9.token-two-for-the-pool.signature-two";

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

beforeEach(() => {
  process.env.JWT_SECRET = "freepi-pool-test-secret";
  dbMocks.loadFreepiCredentialSlotCiphertexts.mockReset();
  dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([]);
  invalidateFreepiCredentialPool();
});

describe("validateFreepiCredential", () => {
  it("accepts a token free-pi answers 204 for", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(204));
    await expect(validateFreepiCredential(TOKEN_ONE, { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("accepts a 200 too, so a future ad body does not break the check", async () => {
    await expect(
      validateFreepiCredential(TOKEN_ONE, { fetchImpl: vi.fn().mockResolvedValue(response(200)) }),
    ).resolves.toBeUndefined();
  });

  it("rejects a token free-pi refuses, with a plain sentence", async () => {
    await expect(
      validateFreepiCredential(TOKEN_ONE, { fetchImpl: vi.fn().mockResolvedValue(response(401)) }),
    ).rejects.toThrow(/expired|refused/i);
    await expect(
      validateFreepiCredential(TOKEN_ONE, { fetchImpl: vi.fn().mockResolvedValue(response(403)) }),
    ).rejects.toThrow(/expired|refused/i);
  });

  it("does not save when free-pi cannot confirm, and says so", async () => {
    await expect(
      validateFreepiCredential(TOKEN_ONE, { fetchImpl: vi.fn().mockResolvedValue(response(503)) }),
    ).rejects.toThrow(/Nothing was saved/i);
  });

  it("a network failure is a plain sentence, never the raw fetch error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.freepi.ai"));
    await expect(validateFreepiCredential(TOKEN_ONE, { fetchImpl })).rejects.toThrow(
      /Could not reach free-pi/i,
    );
    await expect(validateFreepiCredential(TOKEN_ONE, { fetchImpl })).rejects.not.toThrow(/getaddrinfo/);
  });

  it("a short value is refused before any network call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      validateFreepiCredential("too-short", { fetchImpl, timeoutMs: 10 }),
    ).rejects.toThrow(/complete free-pi token/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect("too-short".length).toBeLessThan(FREEPI_MIN_TOKEN_LENGTH);
  });

  it("a value with a line break is refused: it cannot be a token", async () => {
    await expect(validateFreepiCredential(`${TOKEN_ONE}\r\nx`, { fetchImpl: vi.fn() })).rejects.toThrow(
      /line break/i,
    );
  });
});

describe("getFreepiCredentialPool", () => {
  it("decrypts the rows in slot order with their labels", async () => {
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([
      { slot: 0, label: "main", ...encryptFreepiCredential(TOKEN_ONE) },
      { slot: 2, label: null, ...encryptFreepiCredential(TOKEN_TWO) },
    ]);
    await expect(getFreepiCredentialPool()).resolves.toEqual([
      { token: TOKEN_ONE, slot: 0, label: "main" },
      { token: TOKEN_TWO, slot: 2, label: null },
    ]);
  });

  it("caches the read, so two CLI starts in a minute mean one database read", async () => {
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([
      { slot: 0, label: null, ...encryptFreepiCredential(TOKEN_ONE) },
    ]);
    await getFreepiCredentialPool();
    await getFreepiCredentialPool();
    expect(dbMocks.loadFreepiCredentialSlotCiphertexts).toHaveBeenCalledOnce();
  });

  it("picks up a rotation immediately after the cache is cleared", async () => {
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([
      { slot: 0, label: null, ...encryptFreepiCredential(TOKEN_ONE) },
    ]);
    expect(await getFreepiCredentialPool()).toHaveLength(1);
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([
      { slot: 0, label: null, ...encryptFreepiCredential(TOKEN_TWO) },
    ]);
    invalidateFreepiCredentialPool();
    const pool = await getFreepiCredentialPool();
    expect(pool.map((entry) => entry.token)).toEqual([TOKEN_TWO]);
  });

  it("skips a row it cannot decrypt instead of failing every other token", async () => {
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockResolvedValue([
      { slot: 0, label: null, ciphertext: "bm9wZQ==", iv: "AAAAAAAAAAAAAAAA", authTag: "AAAAAAAAAAAAAAAAAAAAAA==" },
      { slot: 1, label: null, ...encryptFreepiCredential(TOKEN_TWO) },
    ]);
    const pool = await getFreepiCredentialPool();
    expect(pool.map((entry) => entry.slot)).toEqual([1]);
  });

  it("a database failure is an empty pool, never a crash", async () => {
    dbMocks.loadFreepiCredentialSlotCiphertexts.mockRejectedValue(new Error("db down"));
    await expect(getFreepiCredentialPool()).resolves.toEqual([]);
  });

  it("an empty table is an empty pool, never an invented token", async () => {
    await expect(getFreepiCredentialPool()).resolves.toEqual([]);
  });
});

describe("selectNextFreepiCredential", () => {
  const entries = [
    { token: TOKEN_ONE, slot: 0, label: null },
    { token: TOKEN_TWO, slot: 1, label: null },
  ];

  it("walks the pool in order and wraps around", () => {
    expect(selectNextFreepiCredential(entries, 0)).toEqual({ entry: entries[0], nextCursor: 1 });
    expect(selectNextFreepiCredential(entries, 1)).toEqual({ entry: entries[1], nextCursor: 0 });
    expect(selectNextFreepiCredential(entries, 2)).toEqual({ entry: entries[0], nextCursor: 1 });
  });

  it("an empty pool has nothing to select", () => {
    expect(selectNextFreepiCredential([], 0)).toBeUndefined();
  });

  it("the pool size is the eight slots the panel shows", () => {
    expect(FREEPI_CREDENTIAL_POOL_SIZE).toBe(8);
  });
});
