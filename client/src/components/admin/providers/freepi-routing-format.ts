/**
 * How one routing line is written on the admin panel.
 *
 * Every line must fit the panel, so each field has a fixed shape and the model
 * name is the only thing that gets cut. A missing number is a dash, never a zero:
 * "we did not get a count" and "it cost nothing" are different facts.
 */

/** "2026-11-24T04:12:44.000Z" -> "04:12:44", in UTC so two admins agree. */
export function clockLabel(at: string | null | undefined): string {
  if (!at) return "--:--:--";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" });
}

/** `slot 2` when the id says which slot it was, else the id itself. */
export function slotLabel(slot: number | null | undefined, key: string): string {
  return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 ? `slot ${slot + 1}` : key;
}

/** Keep the head of a model id and cut the tail, so the columns stay put. */
export function shortModel(model: string, max = 18): string {
  const clean = (model ?? "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1))}\u2026`;
}

/** "1.2s" for a second or more, "840ms" below. */
export function durationLabel(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "\u2014";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

/** "412 / 588", or a dash when the service sent no usage at all. */
export function tokensLabel(inputTokens: number | null | undefined, outputTokens: number | null | undefined): string {
  const one = typeof inputTokens === "number" && Number.isFinite(inputTokens) ? String(inputTokens) : "\u2014";
  const two = typeof outputTokens === "number" && Number.isFinite(outputTokens) ? String(outputTokens) : "\u2014";
  return `${one} / ${two}`;
}

/** Lime for a fine answer, pale orange for a wait, red for a real failure. */
export function statusTone(status: number | null | undefined): "good" | "warn" | "bad" | "idle" {
  if (typeof status !== "number") return "idle";
  if (status === 0) return "bad";
  if (status >= 200 && status < 300) return "good";
  if (status === 429 || status === 408 || status === 409) return "warn";
  return "bad";
}
