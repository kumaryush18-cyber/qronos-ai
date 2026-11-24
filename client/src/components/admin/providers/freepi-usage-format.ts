/**
 * How a credits row is written on screen.
 *
 * Three small rules, kept away from the component so they can be tested alone:
 *  - a number the service did not report is a dash, never a zero;
 *  - a refill time is short and always in UTC, so two admins read it the same;
 *  - an age says how old the number is, so nobody mistakes a cached read for a
 *    live one.
 */

/** 3990 -> "3,990"; null or a broken value -> "—". */
export function fmtCredits(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
}

/** The share left, 0..1, or null when either number is missing. */
export function creditShare(remaining: number | null, allowance: number | null): number | null {
  if (typeof remaining !== "number" || typeof allowance !== "number") return null;
  if (!Number.isFinite(remaining) || !Number.isFinite(allowance) || allowance <= 0) return null;
  return Math.max(0, Math.min(1, remaining / allowance));
}

/** "2026-11-25T00:00:00.000Z" -> "25 Nov 00:00 UTC"; anything unreadable -> null. */
export function refillLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const day = at.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} ${time} UTC`;
}

/** "checked just now" / "checked 3m ago" / "checked 2h ago". */
export function ageLabel(value: string | null | undefined, now: number): string {
  if (!value) return "checked —";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "checked —";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "checked just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}

/** The colour of the thin bar: lime, pale orange when low, red when empty. */
export function creditTone(share: number | null): "good" | "low" | "empty" {
  if (share === null) return "good";
  if (share <= 0) return "empty";
  if (share < 0.2) return "low";
  return "good";
}
