import { createHmac, timingSafeEqual } from "node:crypto";

const PASSCODE_HMAC_SALT = "qronos-admin-passcode-constant-time-salt-v1";

function equalConstantTime(received: string, expected: string) {
  // Digest both strings to fixed 32-byte SHA-256 HMAC buffers so timingSafeEqual is always
  // executed on equal-length buffers in strictly invariant execution time, leaking zero length details.
  const receivedHash = createHmac("sha256", PASSCODE_HMAC_SALT).update(received, "utf8").digest();
  const expectedHash = createHmac("sha256", PASSCODE_HMAC_SALT).update(expected, "utf8").digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export function verifyAdminPasscode(passcode: string) {
  const configuredPasscode =
    process.env.QRONOS_ADMIN_PASSCODE?.trim() ||
    process.env.ADMIN_PASSCODE?.trim();
  if (!configuredPasscode || configuredPasscode.length < 4) return false;
  return equalConstantTime(passcode.trim(), configuredPasscode);
}
