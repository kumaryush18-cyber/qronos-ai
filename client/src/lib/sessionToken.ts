/**
 * Session Token Manager (Hardened)
 *
 * Security Notice:
 * Tokens are NEVER persisted to localStorage or sessionStorage to protect
 * against Cross-Site Scripting (XSS) credential exfiltration.
 * Authentication relies strictly on secure, httpOnly, SameSite cookies managed
 * by the browser.
 */

export function persistSessionToken(_token: string): void {
  // Deliberate no-op: tokens must not be persisted in browser storage
}

export function getStoredSessionToken(): string | null {
  // Returns null: authentication uses httpOnly cookies with credentials: "include"
  return null;
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem("tokenforge_session_token");
    localStorage.removeItem("qronos_session_token");
    localStorage.removeItem("manus-cookie");
    localStorage.removeItem("manus-runtime-user-info");
    sessionStorage.removeItem("tokenforge_session_token");
    sessionStorage.removeItem("qronos_session_token");
    sessionStorage.removeItem("manus-cookie");
  } catch {
    // ignore storage access restrictions
  }
}
