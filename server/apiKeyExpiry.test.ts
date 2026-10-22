import { describe, expect, it } from "vitest";
import {
  createApiKey,
  findActiveApiKey,
  listApiKeys,
  cleanupUserExpiredApiKeys,
  publicApiKey,
} from "./db";

describe("API Key Expiry, Custom Limits & Auto-Deletion", () => {
  it("formats publicApiKey with expiry date and limits correctly", () => {
    const rawKey = {
      id: 99,
      userId: 1,
      keyPrefix: "qr_test12345…",
      keyHash: "hash123",
      label: "Test Expiry Key",
      keyGroup: "token_plan",
      status: "active" as const,
      expiresAt: new Date("2026-11-20T23:59:59.000Z"),
      spendLimitTokens: 50_000_000,
      spendLimitNanos: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const pub = publicApiKey(rawKey as any);
    expect(pub.id).toBe(99);
    expect(pub.label).toBe("Test Expiry Key");
    expect(pub.expiresAt).toEqual(new Date("2026-11-20T23:59:59.000Z"));
    expect(pub.spendLimitTokens).toBe(50_000_000);
    expect(pub.spendLimitNanos).toBeNull();
  });

  it("formats publicApiKey with never-expires (null) and unlimited limits (null) by default", () => {
    const defaultKey = {
      id: 100,
      userId: 1,
      keyPrefix: "qr_default…",
      keyHash: "hash456",
      label: "Default Unlimited Key",
      keyGroup: "payg",
      status: "active" as const,
      expiresAt: null,
      spendLimitTokens: null,
      spendLimitNanos: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const pub = publicApiKey(defaultKey as any);
    expect(pub.expiresAt).toBeNull();
    expect(pub.spendLimitTokens).toBeNull();
    expect(pub.spendLimitNanos).toBeNull();
  });

  it("handles cleanup function without errors", async () => {
    const cleaned = await cleanupUserExpiredApiKeys(999999);
    expect(typeof cleaned).toBe("number");
  });
});
