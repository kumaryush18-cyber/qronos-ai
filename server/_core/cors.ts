import type { Request, Response, NextFunction } from "express";

/**
 * Validates whether an incoming HTTP Origin header is authorized.
 * - Non-browser or same-origin requests (no Origin header) are allowed.
 * - Explicit "null" origins (sandboxed iframes, opaque contexts) are blocked.
 * - Origins matching the request Host or X-Forwarded-Host are allowed.
 * - Localhost and loopback IPs are allowed for local development.
 * - Trusted preview platforms (.run.app, .ai.studio, .web.app) and configured APP_URL are allowed.
 */
export function isAllowedOrigin(origin: string | undefined, req: Request): boolean {
  if (!origin) return true;
  if (origin === "null") return false;

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();

    // 1. Compare against request host headers
    const reqHost = (req.headers["x-forwarded-host"] || req.headers.host || "")
      .toString()
      .toLowerCase()
      .split(",")[0]
      .trim();

    if (reqHost && originHost === reqHost) {
      return true;
    }

    // 2. Allow local loopback development
    if (
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1" ||
      originUrl.hostname === "::1"
    ) {
      return true;
    }

    // 3. Match explicitly declared application URLs in environment
    const allowedEnvUrls = [
      process.env.APP_URL,
      process.env.VITE_APP_URL,
      process.env.BASE_URL,
    ].filter(Boolean) as string[];

    for (const urlStr of allowedEnvUrls) {
      try {
        const u = new URL(urlStr);
        if (originHost === u.host.toLowerCase()) {
          return true;
        }
      } catch {}
    }

    // 4. Allow trusted deployment and preview domains
    if (
      originHost.endsWith(".run.app") ||
      originHost.endsWith(".ai.studio") ||
      originHost.endsWith(".web.app")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Strict CORS middleware that rejects unverified cross-origin domains and "null" origins.
 */
export function createStrictCors(options: { allowCredentials?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (!origin) {
      return next();
    }

    if (!isAllowedOrigin(origin, req)) {
      if (req.method === "OPTIONS") {
        return res.status(403).json({ error: "CORS origin rejected" });
      }
      return res.status(403).json({ error: "CORS origin rejected" });
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    if (options.allowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-admin-key, x-admin-secret, x-admin-passcode"
    );

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  };
}
