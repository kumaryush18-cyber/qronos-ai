import { beforeEach, describe, expect, it } from "vitest";

import {
  decryptFreepiCredential,
  encryptFreepiCredential,
  freepiFingerprintSuffix,
} from "./freepiCredentialVault";
import { encryptOrcaRouterCredential } from "./orcaRouterCredentialVault";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.freepi-token-for-the-pool.signature";

describe("free-pi credential vault", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "freepi-vault-test-secret";
  });

  it("round-trips a token and never keeps it in the ciphertext", () => {
    const encrypted = encryptFreepiCredential(TOKEN);
    expect(encrypted.ciphertext).not.toContain(TOKEN);
    expect(encrypted.iv).toHaveLength(16);
    expect(encrypted.keyFingerprint).toHaveLength(10);
    expect(decryptFreepiCredential(encrypted)).toBe(TOKEN);
  });

  it("uses a fresh iv, so the same token encrypts differently each time", () => {
    const first = encryptFreepiCredential(TOKEN);
    const second = encryptFreepiCredential(TOKEN);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.keyFingerprint).toBe(second.keyFingerprint);
  });

  it("trims a pasted value, so a token with a trailing space still works", () => {
    expect(decryptFreepiCredential(encryptFreepiCredential(`  ${TOKEN}\n`))).toBe(TOKEN);
  });

  it("refuses an empty token instead of writing an unusable row", () => {
    expect(() => encryptFreepiCredential("   ")).toThrow(/must not be empty/i);
  });

  it("cannot read an OrcaRouter ciphertext: the two pools use different contexts", () => {
    const orca = encryptOrcaRouterCredential("sk-orca-managed-key-for-the-vault");
    expect(() => decryptFreepiCredential(orca)).toThrow();
  });

  it("shows only the last six characters of the fingerprint", () => {
    const encrypted = encryptFreepiCredential(TOKEN);
    expect(freepiFingerprintSuffix(encrypted.keyFingerprint)).toBe(encrypted.keyFingerprint.slice(-6));
    expect(freepiFingerprintSuffix(encrypted.keyFingerprint)).toHaveLength(6);
  });

  it("refuses to work without a server secret", () => {
    delete process.env.JWT_SECRET;
    expect(() => encryptFreepiCredential(TOKEN)).toThrow(/vault is unavailable/i);
  });
});
