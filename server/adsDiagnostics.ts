// One honest line about why an ad did not appear.
//
// The ad slot is silent by design: a 204 draws nothing on purpose. That silence
// is also the problem — "no fill in your country", "the key is sandbox", and
// "the feature is broken" all look the same from the terminal.
//
// So this module builds exactly one line for the server log. It never contains a
// key: only whether a key is present. The upstream message is cut to one line and
// a hard length, because an SDK error can be many lines long.
export const AD_DIAGNOSTIC_MAX_CHARS = 200;

/** Debug lines are opt-in: `QRONOS_DEBUG_ADS=1`. Off by default. */
export function adsDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QRONOS_DEBUG_ADS === "1";
}

/** One line, no control characters, cut at the cap. */
export function cleanUpstreamMessage(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Error ? value.message : String(value);
  const text = raw
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > AD_DIAGNOSTIC_MAX_CHARS ? `${text.slice(0, AD_DIAGNOSTIC_MAX_CHARS - 1)}\u2026` : text;
}

export interface AdMissDetails {
  slot: string;
  /** `gravity`, `thrad`, or `none` when nothing was configured at all. */
  source: string;
  /** How many creatives the network returned. 0 is the interesting case. */
  fill: number;
  keyPresent: boolean;
  /** The network's own words, if any. */
  error?: unknown;
  /** Optional extra facts, such as the country the gateway used. */
  extra?: Record<string, string | number | boolean>;
}

/**
 * `[ads] no fill slot=banner source=gravity fill=0 key=present err=...`
 *
 * Reads left to right, so the two facts that matter — which network, and whether
 * it had a key — come before anything wordy.
 */
export function adMissLine(details: AdMissDetails): string {
  const parts = [
    `[ads] no fill`,
    `slot=${details.slot || "unknown"}`,
    `source=${details.source || "none"}`,
    `fill=${Number.isFinite(details.fill) ? details.fill : 0}`,
    `key=${details.keyPresent ? "present" : "missing"}`,
  ];
  for (const [name, value] of Object.entries(details.extra ?? {})) {
    parts.push(`${name}=${String(value).slice(0, 60)}`);
  }
  const error = cleanUpstreamMessage(details.error);
  if (error) parts.push(`err=${error}`);
  return parts.join(" ");
}

/**
 * Log one miss. Never throws, and prints nothing about the key itself.
 *
 * `loud` is for a real upstream error (worth seeing once); a plain empty
 * placement is logged only when the debug flag is on, because an empty slot is
 * the normal state of a healthy ad network.
 */
export function logAdMiss(details: AdMissDetails & { loud?: boolean }): void {
  try {
    if (!details.loud && !adsDebugEnabled()) return;
    console.warn(adMissLine(details));
  } catch {
    // A log line must never break a request.
  }
}
