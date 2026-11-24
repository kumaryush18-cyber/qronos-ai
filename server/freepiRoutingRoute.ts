import type { Express, Request, Response } from "express";
import { findActiveApiKey } from "./db";
import {
  normalizeRoutingEvent,
  recentRoutingEvents,
  recordRoutingEvent,
  routingEventCount,
  FREEPI_ROUTING_PANEL_SIZE,
} from "./freepiRouting";

/**
 * The CLI routing endpoint.
 *
 * A free-model request goes straight from the user's machine to the upstream
 * service, so the gateway never sees it. The CLI sends one small event per
 * attempt so the admin panel can show which key served what, for how long, and
 * what it cost in tokens.
 *
 * The rules:
 *  - a valid qronos key is required, and both spellings of the path work;
 *  - an event with no usable fields is a 400, and nothing is stored;
 *  - nothing is logged or audited: this is a high-frequency line, not an action;
 *  - the reply is tiny, because the CLI must never wait on it.
 */
export type RoutingRouteDeps = {
  /** Seam for tests. The default reads the qronos api key from the request. */
  resolveUser?: (req: Request) => Promise<{ userId: number } | null>;
  /** Seam for tests. */
  record?: typeof recordRoutingEvent;
  /** Seam for tests. */
  recent?: typeof recentRoutingEvents;
  /** Seam for tests. */
  count?: typeof routingEventCount;
  now?: () => number;
};

async function defaultResolveUser(req: Request): Promise<{ userId: number } | null> {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : String(req.headers["x-api-key"] ?? "").trim();
  if (!token) return null;
  const record = await findActiveApiKey(token);
  if (!record) return null;
  return { userId: record.userId };
}

export function registerFreepiRoutingRoutes(app: Express, deps: RoutingRouteDeps = {}): void {
  const resolveUser = deps.resolveUser ?? defaultResolveUser;
  const record = deps.record ?? recordRoutingEvent;
  const recent = deps.recent ?? recentRoutingEvents;
  const count = deps.count ?? routingEventCount;
  const now = deps.now ?? (() => Date.now());

  const postHandler = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    let resolved: { userId: number } | null = null;
    try {
      resolved = await resolveUser(req);
    } catch {
      return res.status(503).json({ error: "Could not check your key right now. Please retry shortly." });
    }
    if (!resolved) return res.status(401).json({ error: "Unauthorized" });

    const event = normalizeRoutingEvent(req.body, now());
    if (!event) return res.status(400).json({ error: "That is not a routing event." });

    record(event);
    return res.status(202).json({ ok: true });
  };

  const getHandler = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    let resolved: { userId: number } | null = null;
    try {
      resolved = await resolveUser(req);
    } catch {
      return res.status(503).json({ error: "Could not check your key right now. Please retry shortly." });
    }
    if (!resolved) return res.status(401).json({ error: "Unauthorized" });

    return res.status(200).json({
      windowSize: FREEPI_ROUTING_PANEL_SIZE,
      total: count(),
      events: recent(FREEPI_ROUTING_PANEL_SIZE),
    });
  };

  app.post("/cli/freepi/routing", postHandler);
  app.post("/api/cli/freepi/routing", postHandler);
  app.get("/cli/freepi/routing", getHandler);
  app.get("/api/cli/freepi/routing", getHandler);
}
