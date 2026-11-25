// Everything the ad request needs to look like a real conversation to Gravity.
//
// Why this file exists: the first version of our ad call sent a single topic
// string ("Coding and AI tools") and a hard-coded user agent. Gravity's ops
// team called both out, and both cost us fill: their auction prices real
// conversation and real clients. So the honest facts (messages, device, email
// hash, placement id) are built here, in one place, with no I/O — the routes
// stay thin and these rules are unit-tested on their own.

import { createHash } from "node:crypto";

/** How many messages we keep before handing them to the SDK. */
export const AD_MAX_MESSAGES = 8;
/**
 * A safety cap per message, not a targeting decision. The Gravity SDK itself
 * sends only the last two turns (`toGravityMessages`), so we hold the real
 * text and cut only what is absurdly large (a pasted file, a stack trace).
 */
export const AD_MESSAGE_MAX_CHARS = 4_000;
/** The header that carries the conversation from the CLI, base64url JSON. */
export const AD_MESSAGES_HEADER = "x-ad-messages";
/** The header that carries a pre-hashed email. Never the email itself. */
export const AD_USER_HASH_HEADER = "x-ad-user-hash";

export type AdSurface = "cli" | "web";
export type AdSlot = "banner" | "inline";

export interface FakeMessage {
  role: "user" | "assistant";
  content: string;
}

interface PlacementRule {
  env: string;
  fallback: string;
  placement: "below_response" | "inline_response";
  maxChars?: number;
}

/**
 * The four placements that exist in the Gravity dashboard. The fallbacks are
 * the ids as registered, so a missing env var still asks for the right slot;
 * only a dashboard rename needs the env override.
 */
export const PLACEMENT_RULES: Record<string, PlacementRule> = {
  "cli:banner": {
    env: "GRAVITY_PLACEMENT_CLI_BANNER",
    fallback: "Qronos-CLI-Banner",
    placement: "below_response",
    // One line in a terminal cannot hold a paragraph.
    maxChars: 160,
  },
  "cli:inline": {
    env: "GRAVITY_PLACEMENT_CLI_INLINE",
    fallback: "Qronos-CLI-Inline-card",
    placement: "inline_response",
    maxChars: 220,
  },
  "web:banner": {
    env: "GRAVITY_PLACEMENT_WEB_BELOW",
    fallback: "Qronos-AI-Below-response",
    placement: "below_response",
  },
  "web:inline": {
    env: "GRAVITY_PLACEMENT_WEB_INLINE",
    fallback: "Qronos-AI-Inline-response",
    placement: "inline_response",
  },
};

export interface PlacementConfig {
  placement: "below_response" | "inline_response";
  placement_id: string;
  max_ad_text_chars?: number;
}

/** The placement object the SDK expects. Unknown surface/slot falls back to CLI banner. */
export function placementConfig(
  surface: AdSurface | string | undefined,
  slot: AdSlot | string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): PlacementConfig {
  const key = `${surface === "web" ? "web" : "cli"}:${slot === "inline" ? "inline" : "banner"}`;
  const rule = PLACEMENT_RULES[key]!;
  const id = (env[rule.env] || "").trim() || rule.fallback;
  const config: PlacementConfig = { placement: rule.placement, placement_id: id };
  if (rule.maxChars) config.max_ad_text_chars = rule.maxChars;
  return config;
}

const ANSI = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(ANSI, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Keeps only real conversation turns, in order, capped. An empty result is
 * normal (a brand-new session) — the caller decides what to do about it.
 */
export function sanitizeMessages(raw: unknown): FakeMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: FakeMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;
    let content = cleanText((entry as { content?: unknown }).content);
    if (!content) continue;
    if (content.length > AD_MESSAGE_MAX_CHARS) content = `${content.slice(0, AD_MESSAGE_MAX_CHARS - 1)}…`;
    out.push({ role, content });
  }
  return out.slice(-AD_MAX_MESSAGES);
}

/** Reads the base64url conversation header. Any malformed value is simply empty. */
export function decodeMessagesHeader(value: unknown): FakeMessage[] {
  if (typeof value !== "string" || !value) return [];
  try {
    return sanitizeMessages(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return [];
  }
}

/** The inverse, used by the CLI and by tests. */
export function encodeMessagesHeader(messages: FakeMessage[]): string {
  return Buffer.from(JSON.stringify(messages), "utf8").toString("base64url");
}

/** A hashed email is 64 hex characters, nothing else. */
export function emailHashOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : undefined;
}

/** Gravity's own normalisation: trim + lowercase, then SHA-256 hex. */
export function hashEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (!value || !value.includes("@")) return undefined;
  return createHash("sha256").update(value).digest("hex");
}

function header(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = headers?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  return undefined;
}

/** Only a country we truly know: the edge header. Never a guessed "US". */
export function countryFrom(headers: Record<string, unknown> | undefined): string | undefined {
  const raw = header(headers, "cf-ipcountry");
  if (!raw) return undefined;
  const code = raw.toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/**
 * The device block Gravity reads. `os`, `arch` and the version come from the
 * client's own headers, and the user agent is the real one — a fixed string
 * makes every request look like the same machine.
 */
export function realDevice(
  headers: Record<string, unknown> | undefined,
  ip: string | undefined,
): { ua: string; ip?: string; device_type: string; os?: string; arch?: string } {
  const os = header(headers, "x-client-os");
  const arch = header(headers, "x-client-arch");
  const version = header(headers, "x-client-version");
  const rawUa = header(headers, "user-agent");
  const built = version && os ? `qronos-cli/${version} (${os}${arch ? `; ${arch}` : ""})` : undefined;
  const ua = (built || rawUa || "qronos-cli").slice(0, 200);
  const device: { ua: string; ip?: string; device_type: string; os?: string; arch?: string } = {
    ua,
    device_type: "desktop",
  };
  if (ip) device.ip = ip;
  if (os) device.os = os;
  if (arch) device.arch = arch;
  return device;
}

export function clientIpFrom(headers: Record<string, unknown> | undefined, socketIp?: string): string | undefined {
  const forwarded = header(headers, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return socketIp || undefined;
}

/** One short line about the request, for the miss log. Counts, never content. */
export function requestSummary(messages: FakeMessage[], placementId: string): string {
  return `msgs=${messages.length} placement=${placementId}`;
}
