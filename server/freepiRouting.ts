// Which shared key served which request, for the admin panel.
//
// This is a live window, not a ledger: the last 200 events, in memory, gone on
// the next deploy. That is on purpose. A ledger would be a second database table
// nobody asked for, and the question it answers — "what is happening right now?"
// — is answered better by a small ring.
//
// Rules:
//  - an event carries a key id (such as `srv-2`), never a key;
//  - a number the CLI did not report stays null, never a zero;
//  - a body that does not look like an event is refused whole, never half-stored.
export const FREEPI_ROUTING_RING_SIZE = 200;
export const FREEPI_ROUTING_PANEL_SIZE = 20;
const MAX_MS = 10 * 60 * 1000;
const MAX_TOKENS = 10_000_000;

export interface FreepiRoutingEvent {
  /** The pool id, such as `srv-2`. An id, not a secret. */
  key: string;
  slot: number | null;
  model: string;
  status: number;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** When the gateway received it. */
  at: string;
}

const KEY_SHAPE = /^[A-Za-z0-9_-]{1,16}$/;
const MODEL_SHAPE = /^[\w.\-/:]{1,64}$/;

const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

const tokenCount = (value: unknown): number | null => int(value, 0, MAX_TOKENS);

/**
 * One event, or null.
 *
 * Everything is checked: a key id that could carry a token is refused, an
 * impossible duration is refused, and an unknown extra field is dropped rather
 * than stored.
 */
export function normalizeRoutingEvent(body: unknown, now: number = Date.now()): FreepiRoutingEvent | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;

  const key = typeof input.key === "string" ? input.key.trim() : "";
  // A JWT starts with `eyJ`. An id never does, so this costs nothing and refuses
  // the one shape that must never be stored here.
  if (!KEY_SHAPE.test(key) || /^eyJ/i.test(key)) return null;

  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!MODEL_SHAPE.test(model)) return null;

  const status = int(input.status, 0, 599);
  if (status === null) return null;

  const ms = int(input.ms, 0, MAX_MS);
  if (ms === null) return null;

  const slot = input.slot === null || input.slot === undefined ? null : int(input.slot, 0, 99);

  return {
    key,
    slot,
    model,
    status,
    ms,
    inputTokens: tokenCount(input.inputTokens),
    outputTokens: tokenCount(input.outputTokens),
    at: new Date(now).toISOString(),
  };
}

const ring: FreepiRoutingEvent[] = [];

/** Store one event. The oldest falls off the end. */
export function recordRoutingEvent(event: FreepiRoutingEvent): void {
  ring.push(event);
  while (ring.length > FREEPI_ROUTING_RING_SIZE) ring.shift();
}

/** The newest events first, capped so a panel line never becomes a wall. */
export function recentRoutingEvents(limit: number = FREEPI_ROUTING_PANEL_SIZE): FreepiRoutingEvent[] {
  const wanted = Math.max(1, Math.min(limit, FREEPI_ROUTING_RING_SIZE));
  return ring.slice(-wanted).reverse();
}

/** How many events the window holds. Shown on the panel, so it is never a mystery. */
export function routingEventCount(): number {
  return ring.length;
}

/** Forget everything. For tests only. */
export function resetRoutingEvents(): void {
  ring.length = 0;
}
