import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  loadFreepiCredentialSlotCiphertexts: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import {
  FREEPI_CREDENTIAL_POOL_SIZE,
  FREEPI_MIN_TOKEN_LENGTH,
  FREEPI_POOL_FULL_MESSAGE,
  findDuplicateFreepiSlot,
  findNextFreeFreepiSlot,
  getFreepiCredentialPool,
  invalidateFreepiCredentialPool,
  saveFreepiCredential,
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

// ---------------------------------------------------------------------------
// A CLI login fills the lowest free slot, and never replaces a token
// ---------------------------------------------------------------------------

describe("findNextFreeFreepiSlot", () => {
  it("starts at slot 0 when the pool is empty", () => {
    expect(findNextFreeFreepiSlot([])).toBe(0);
  });

  it("takes the lowest gap, not the highest number plus one", () => {
    expect(findNextFreeFreepiSlot([0, 2, 3])).toBe(1);
  });

  it("is null when every slot is taken", () => {
    expect(findNextFreeFreepiSlot([0, 1, 2, 3, 4, 5, 6, 7])).toBeNull();
  });

  it("never proposes a slot outside the pool", () => {
    expect(findNextFreeFreepiSlot([0, 1], 2)).toBeNull();
  });
});

describe("findDuplicateFreepiSlot", () => {
  it("finds the same token with surrounding spaces", () => {
    expect(findDuplicateFreepiSlot("  eyJ-same  ", [{ token: "eyJ-same", slot: 4, label: null }])).toBe(4);
  });

  it("a different token is not a duplicate", () => {
    expect(findDuplicateFreepiSlot("eyJ-other", [{ token: "eyJ-same", slot: 4, label: null }])).toBeNull();
  });
});

describe("saveFreepiCredential", () => {
  const token = "eyJ-a-real-length-token";

  it("checks the token first, then writes the lowest free slot", async () => {
    const order: string[] = [];
    const saved: Array<{ slot: number }> = [];
    const result = await saveFreepiCredential(
      { token, label: "main", userId: 9 },
      {
        validate: async () => {
          order.push("validate");
        },
        pool: async () => [{ token: "eyJ-old", slot: 0, label: null }],
        listSlots: async () => [{ slot: 0 }],
        save: async (input) => {
          order.push("save");
          saved.push({ slot: input.slot });
        },
      },
    );
    expect(order).toEqual(["validate", "save"]);
    expect(saved).toEqual([{ slot: 1 }]);
    expect(result).toMatchObject({ ok: true, slot: 1, duplicate: false });
    expect(result.ok && result.fingerprint).toHaveLength(6);
  });

  it("a refused token is never written", async () => {
    let wrote = false;
    await expect(
      saveFreepiCredential(
        { token, userId: 9 },
        {
          validate: async () => {
            throw new Error("free-pi refused this token.");
          },
          pool: async () => [],
          listSlots: async () => [],
          save: async () => {
            wrote = true;
          },
        },
      ),
    ).rejects.toThrow("refused");
    expect(wrote).toBe(false);
  });

  it("the same token twice saves once and answers duplicate", async () => {
    let writes = 0;
    const result = await saveFreepiCredential(
      { token, userId: 9 },
      {
        validate: async () => undefined,
        pool: async () => [{ token, slot: 3, label: null }],
        listSlots: async () => [{ slot: 3 }],
        save: async () => {
          writes += 1;
        },
      },
    );
    expect(result).toMatchObject({ ok: true, slot: 3, duplicate: true });
    expect(writes).toBe(0);
  });

  it("a full pool is a refusal, not an overwrite", async () => {
    let writes = 0;
    const full = Array.from({ length: 8 }, (_, slot) => ({ slot }));
    const result = await saveFreepiCredential(
      { token, userId: 9 },
      {
        validate: async () => undefined,
        pool: async () => [],
        listSlots: async () => full,
        save: async () => {
          writes += 1;
        },
      },
    );
    expect(result).toEqual({ ok: false, reason: "full", message: FREEPI_POOL_FULL_MESSAGE });
    expect(writes).toBe(0);
  });
});
