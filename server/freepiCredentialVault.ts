import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * The encrypted store for managed free-pi tokens.
 *
 * It is deliberately a *separate* context string from the OrcaRouter vault: a
 * ciphertext written for one pool can never be decrypted by the other, even
 * though both derive their key from the same `JWT_SECRET`. That way a mistake
 * in one pool cannot leak the other.
 *
 * Rotating `JWT_SECRET` makes existing rows unreadable. That is a deliberate
 * trade: the admin panel then reports "re-add the tokens" instead of serving
 * something that cannot work.
 */
const CREDENTIAL_VAULT_CONTEXT = "Qronos:FreePiCredentialVault:v1";

export type EncryptedFreepiCredential = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyFingerprint: string;
};

function encryptionKey() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("Qronos AI free-pi credential vault is unavailable");
  return createHash("sha256").update(`${CREDENTIAL_VAULT_CONTEXT}\u0000${secret}`).digest();
}

/** Encrypt one token. The fingerprint is a one-way digest, safe to show in a panel. */
export function encryptFreepiCredential(credential: string): EncryptedFreepiCredential {
  const normalized = credential.trim();
  if (!normalized) throw new Error("Free-pi token must not be empty");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyFingerprint: createHash("sha256").update(normalized).digest("hex").slice(-10),
  };
}

/** Decrypt one stored token. Server-side only; never send the result to a browser. */
export function decryptFreepiCredential(
  value: Pick<EncryptedFreepiCredential, "ciphertext" | "iv" | "authTag">,
): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/** The only part of a token the panel is ever allowed to show. */
export function freepiFingerprintSuffix(keyFingerprint: string): string {
  return keyFingerprint.slice(-6);
}

/**
 * The fingerprint of a token that is not stored yet.
 *
 * Same digest as `encryptFreepiCredential`, so the panel and the CLI show the
 * same six characters for the same token. The plain token never leaves this
 * function.
 */
export function freepiTokenFingerprint(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex").slice(-10);
}
