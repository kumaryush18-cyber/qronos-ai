import type { Express, Request, Response } from "express";
import { findActiveApiKey } from "./db";
import type { FreepiCredentialSelection } from "./freepiCredentials";
import { getFreepiCredentialPool } from "./freepiCredentials";

/**
 * The CLI token endpoint.
 *
 * Every signed-in qronos user may read the pool, so nobody has to keep a
 * free-pi token on their own machine. That is a deliberate decision: the tokens
 * are ours, and the admin panel is the one place they are managed.
 *
 * What travels back is a real token, so the rules are strict:
 *  - a valid qronos key is required (`Authorization: Bearer …` or `x-api-key`);
 *  - the response is never cached by any proxy (`no-store`);
 *  - nothing here is ever logged, audited or counted, because a log line with a
 *    token in it is a permanent leak;
 *  - an empty pool is a clear 503, never an empty list the CLI could misread.
 */

/** The one sentence a CLI shows when the admin panel has no token yet. */
export const FREEPI_POOL_EMPTY_MESSAGE =
  "No free-pi token is available right now. Ask the Qronos team to add one in the admin panel.";

export type FreepiTokenRouteDeps = {
  /** Seam for tests. The default reads the qronos api key from the request. */
  resolveUser?: (req: Request) => Promise<{ userId: number } | null>;
  /** Seam for tests. */
  getPool?: () => Promise<FreepiCredentialSelection[]>;
};

/** The default resolver: the same rule `GET /api/me` uses. */
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

/**
 * What one response may contain, and nothing more.
 *
 * The slot number is an id, not a secret; the label is whatever the admin typed;
 * the token is the only sensitive field.
 */
export function publicTokenPayload(entries: readonly FreepiCredentialSelection[]) {
  return {
    count: entries.length,
    oneRequestPerToken: true as const,
    tokens: entries.map((entry) => ({
      id: String(entry.slot),
      label: entry.label,
      token: entry.token,
    })),
  };
}

export function registerFreepiCliTokenRoutes(app: Express, deps: FreepiTokenRouteDeps = {}): void {
  const resolveUser = deps.resolveUser ?? defaultResolveUser;
  const getPool = deps.getPool ?? (() => getFreepiCredentialPool());

  const handler = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");

    let resolved: { userId: number } | null = null;
    try {
      resolved = await resolveUser(req);
    } catch {
      // A database hiccup is "not now", not "not you": 503 is closer to the truth.
      return res.status(503).json({ error: "Could not check your key right now. Please retry shortly." });
    }
    if (!resolved) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let entries: FreepiCredentialSelection[] = [];
    try {
      entries = await getPool();
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      return res.status(503).json({ error: FREEPI_POOL_EMPTY_MESSAGE });
    }
    return res.status(200).json(publicTokenPayload(entries));
  };

  // Two spellings, like every other CLI route: with and without `/api`.
  app.get("/freepi/tokens", handler);
  app.get("/api/cli/freepi/tokens", handler);
}
