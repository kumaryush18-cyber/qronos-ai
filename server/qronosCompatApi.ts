/**
 * Qronos Compatibility API (Phase 2, Option A of PLAN.md in the qronos-code repo).
 *
 * The Qronos Code VS Code extension is forked from Kilo Code and its gateway
 * client (`packages/kilo-gateway/src`) speaks Kilo's REST shape. Instead of
 * rewriting the extension client (which would make upstream merges painful),
 * this module exposes the small set of Kilo-compatible routes the extension
 * actually needs:
 *
 *   POST /api/device-auth/codes        -> start GitHub device flow
 *   GET  /api/device-auth/codes/:code  -> poll; on approval mint a `qr_...` key
 *   GET  /api/profile                  -> identity for the extension sidebar
 *   GET  /api/profile/balance          -> credit balance
 *   GET  /api/users/notifications      -> always empty (feature not offered)
 *
 * Out of scope on purpose (see PLAN.md): /api/trpc/*, /api/marketplace,
 * /api/organizations/:id/modes. The extension hides those features instead.
 *
 * Nothing here mutates existing Qronos flows. The GitHub device flow is
 * stateless: GitHub's `device_code` is used directly as the poll handle, so no
 * server-side session map is required.
 */
import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiKeys, users } from "../drizzle/schema";
import {
  ensureCreditAccount,
  ensureDailyCodingTokens,
  findActiveApiKey,
  getCreditProfile,
  getDb,
  grantAdminAccountCredit,
  hashApiKey,
  resolveGitHubIdentity,
} from "./db";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const DEVICE_SCOPE = "read:user user:email";
const DEFAULT_EXPIRES_IN = 900;
const DEFAULT_INTERVAL = 5;
const WELCOME_TOKENS = 10_000_000;
// qronos_change - its own label, so signing in from the editor does not rotate the
// key a CLI user already saved. All token-plan checks accept keyGroup "coding_plan"
// as an alternative to the "Qronos CLI" label.
const CODE_KEY_LABEL = "Qronos Code";

/** Read a Qronos API key from the Authorization or x-api-key header. */
function bearerToken(req: Request): string {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return String(req.headers["x-api-key"] || "").trim();
}

/** Resolve the calling user from an API key. Returns null when unauthenticated. */
async function resolveUser(req: Request) {
  const secret = bearerToken(req);
  if (!secret) return null;
  const key = await findActiveApiKey(secret);
  if (!key) return null;
  await ensureDailyCodingTokens(key.userId);
  const profile = await getCreditProfile(key.userId);
  return { key, profile };
}

/** Mint (or rotate) the persistent `qr_...` key used by the editor extension. */
async function mintCliKey(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");

  const secret = `qr_${randomBytes(32).toString("base64url")}`;
  const keyPrefix = `${secret.slice(0, 15)}…`;
  const keyHash = hashApiKey(secret);

  const existing = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, "active"), eq(apiKeys.label, CODE_KEY_LABEL)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(apiKeys)
      .set({ keyPrefix, keyHash, lastUsedAt: new Date() })
      .where(eq(apiKeys.id, existing[0]!.id));
  } else {
    await db.insert(apiKeys).values({
      userId,
      label: CODE_KEY_LABEL,
      keyPrefix,
      keyHash,
      keyGroup: "coding_plan",
    });
  }

  return secret;
}

/** Fetch the GitHub account email, falling back to a noreply address. */
async function resolveGitHubEmail(accessToken: string, fallbackLogin: string, fallbackId: number): Promise<string> {
  const profileRes = await fetch(GITHUB_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "QronosAI-Code" },
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as any) : {};
  if (profile.email) return profile.email;

  const emailsRes = await fetch(GITHUB_EMAILS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "QronosAI-Code" },
  });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as any[];
    const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
    if (primary?.email) return primary.email;
  }

  return `${fallbackId || "user"}+${fallbackLogin || "github"}@users.noreply.github.com`;
}

export function registerQronosCompatApi(app: Express) {
  /**
   * POST /api/device-auth/codes
   * Kilo contract: DeviceAuthInitiateResponse { code, verificationUrl, expiresIn }.
   * `code` is GitHub's device_code and is used as the poll handle.
   */
  const startDeviceAuth = async (_req: Request, res: Response) => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "GitHub Device Flow is not configured (missing CLIENT_ID)" });
    }

    try {
      const ghRes = await fetch(GITHUB_DEVICE_CODE_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, scope: DEVICE_SCOPE }),
      });

      if (!ghRes.ok) {
        console.error("[Qronos Compat] GitHub device code failed:", ghRes.status, await ghRes.text());
        return res.status(502).json({ error: "Failed to initiate GitHub device code with provider" });
      }

      const data = (await ghRes.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in?: number;
        interval?: number;
      };

      return res.status(200).json({
        code: data.device_code,
        verificationUrl: data.verification_uri,
        expiresIn: data.expires_in || DEFAULT_EXPIRES_IN,
        // Extras the extension may show; harmless for strict Kilo clients.
        userCode: data.user_code,
        interval: data.interval || DEFAULT_INTERVAL,
      });
    } catch (err: any) {
      console.error("[Qronos Compat] error in startDeviceAuth:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
  };

  /**
   * GET /api/device-auth/codes/:code
   * Kilo contract: 202 pending, 403 denied, 410 expired,
   * 200 { status: "approved", token, userEmail }.
   */
  const pollDeviceAuth = async (req: Request, res: Response) => {
    const deviceCode = String(req.params.code || "").trim();
    if (!deviceCode) return res.status(400).json({ error: "Missing device code" });

    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "GitHub Device Flow is not configured" });
    }

    try {
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      const tokenData = (await tokenRes.json()) as any;

      if (tokenData.error === "authorization_pending" || tokenData.error === "slow_down") {
        return res.status(202).json({ status: "pending" });
      }
      if (tokenData.error === "access_denied") {
        return res.status(403).json({ status: "denied" });
      }
      if (tokenData.error === "expired_token") {
        return res.status(410).json({ status: "expired" });
      }
      if (tokenData.error || !tokenData.access_token) {
        return res.status(400).json({ error: tokenData.error_description || "Device authorization failed" });
      }

      const accessToken = tokenData.access_token as string;
      const profileRes = await fetch(GITHUB_USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "QronosAI-Code" },
      });
      const ghUser = profileRes.ok ? ((await profileRes.json()) as any) : {};

      const email = await resolveGitHubEmail(accessToken, ghUser.login, ghUser.id);

      const identity = await resolveGitHubIdentity({
        providerUserId: String(ghUser.id || email),
        email,
        name: ghUser.name || ghUser.login || email.split("@")[0],
      });

      if (identity.kind !== "resolved") {
        return res.status(400).json({ error: "Account resolution failed" });
      }

      const user = identity.user;
      const creditAccount = await ensureCreditAccount(user.id);
      const currentTokens = Number((creditAccount as any)?.codingPlanTokens ?? 0);

      if (currentTokens === 0) {
        try {
          await grantAdminAccountCredit({
            userId: user.id,
            actorUserId: 1,
            amountNanos: 0,
            amountTokens: WELCOME_TOKENS,
            balanceType: "tokens",
          });
        } catch (grantErr) {
          console.warn("[Qronos Compat] Welcome token grant warning:", grantErr);
        }
      }

      const token = await mintCliKey(user.id);
      return res.status(200).json({ status: "approved", token, userEmail: user.email || email });
    } catch (err: any) {
      console.error("[Qronos Compat] error in pollDeviceAuth:", err);
      return res.status(500).json({ error: err?.message || "Failed to process token exchange" });
    }
  };

  /**
   * GET /api/profile
   * Kilo contract: the extension reads `user.email`, `user.name`, `organizations`.
   * Qronos has no organizations, so an empty list keeps the UI happy.
   */
  const getProfile = async (req: Request, res: Response) => {
    const resolved = await resolveUser(req);
    if (!resolved) return res.status(401).json({ error: "Invalid token" });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database unavailable" });

    const row = (await db.select().from(users).where(eq(users.id, resolved.key.userId)).limit(1))[0];
    if (!row) return res.status(401).json({ error: "Invalid token" });

    return res.json({
      user: { id: row.id, email: row.email, name: row.name, tier: row.tier },
      organizations: [],
      selectedOrganizationId: null,
      hasPersonalAccount: true,
    });
  };

  /**
   * GET /api/profile/balance
   * Kilo contract: { balance: number }. We report USD credit plus the token plan
   * as extra fields so the extension and the CLI can both render something useful.
   */
  const getBalance = async (req: Request, res: Response) => {
    const resolved = await resolveUser(req);
    if (!resolved) return res.status(401).json({ error: "Invalid token" });

    const profile = resolved.profile;
    const paygNanos = Number(profile?.paygBalanceNanos ?? 0);
    const tokensRemaining = Number(profile?.codingPlanTokens ?? 0);

    return res.json({
      balance: Number((paygNanos / 1_000_000_000).toFixed(4)),
      tokens_remaining: tokensRemaining,
      tokens_formatted: `${(tokensRemaining / 1_000_000).toFixed(2)}M tokens`,
    });
  };

  /** GET /api/users/notifications - the extension parses { notifications: [] }. */
  const getNotifications = async (_req: Request, res: Response) => {
    return res.json({ notifications: [] });
  };

  app.post("/api/device-auth/codes", startDeviceAuth);
  app.get("/api/device-auth/codes/:code", pollDeviceAuth);
  app.get("/api/profile", getProfile);
  app.get("/api/profile/balance", getBalance);
  app.get("/api/users/notifications", getNotifications);
}
