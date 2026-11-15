import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import {
  ensureCreditAccount,
  ensureDailyCodingTokens,
  findActiveApiKey,
  getDb,
  grantAdminAccountCredit,
  hashApiKey,
  resolveGitHubIdentity,
} from "./db";
import { apiKeys, users } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TOKENFORGE_MODEL_CATALOGUE } from "./modelCatalogue";

interface DeviceSession {
  sessionId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
  consentVersion?: string;
  token?: string;
}

const pendingSessions = new Map<string, DeviceSession>();

// Cleanup stale sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pendingSessions.entries()) {
    if (session.expiresAt <= now) {
      pendingSessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

async function resolveCliUser(req: Request) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : ((req.headers["x-api-key"] as string) || "").trim();

  if (!token) return null;
  const apiKeyRecord = await findActiveApiKey(token);
  if (!apiKeyRecord) return null;

  const db = await getDb();
  if (!db) return null;

  const user = (await db.select().from(users).where(eq(users.id, apiKeyRecord.userId)).limit(1))[0];
  if (!user) return null;

  // Refresh daily 10M tokens if past midnight
  await ensureDailyCodingTokens(user.id);

  const creditAccount = await ensureCreditAccount(user.id);
  return { user, creditAccount, apiKeyRecord };
}

export function registerGitHubDeviceAuth(app: Express) {
  // 1. POST /auth/github/device - Starts device authorization grant
  const handleDeviceStart = async (_req: Request, res: Response) => {
    try {
      const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
      if (!clientId) {
        return res.status(503).json({ error: "GitHub Device Flow is not configured (missing CLIENT_ID)" });
      }

      const ghRes = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: "read:user user:email",
        }),
      });

      if (!ghRes.ok) {
        const errText = await ghRes.text();
        console.error("[Device Auth] GitHub device code failed:", ghRes.status, errText);
        return res.status(502).json({ error: "Failed to initiate GitHub device code with provider" });
      }

      const data = (await ghRes.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval?: number;
      };

      const sessionId = randomBytes(16).toString("hex");
      const interval = data.interval || 5;
      const expiresAt = Date.now() + (data.expires_in || 900) * 1000;

      pendingSessions.set(sessionId, {
        sessionId,
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresAt,
        interval,
      });

      return res.status(200).json({
        session_id: sessionId,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        interval,
      });
    } catch (err: any) {
      console.error("[Device Auth] error in handleDeviceStart:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  };

  app.post("/auth/github/device", handleDeviceStart);
  app.post("/api/auth/github/device", handleDeviceStart);

  // 2. POST /auth/consent - Records accepted terms
  const handleConsent = (req: Request, res: Response) => {
    const { session_id, consent_version } = req.body || {};
    if (session_id && pendingSessions.has(session_id)) {
      const sess = pendingSessions.get(session_id)!;
      sess.consentVersion = consent_version;
    }
    return res.status(200).json({ ok: true });
  };

  app.post("/auth/consent", handleConsent);
  app.post("/api/auth/consent", handleConsent);

  // 3. POST /auth/token - Polls GitHub for token & awards 10M welcome tokens
  const handleTokenPoll = async (req: Request, res: Response) => {
    const { session_id } = req.body || {};
    if (!session_id || !pendingSessions.has(session_id)) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const sess = pendingSessions.get(session_id)!;
    if (sess.expiresAt <= Date.now()) {
      pendingSessions.delete(session_id);
      return res.status(400).json({ error: "Device code expired" });
    }

    if (sess.token) {
      return res.status(200).json({ token: sess.token });
    }

    try {
      const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          device_code: sess.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      const tokenData = (await tokenRes.json()) as any;

      if (tokenData.error) {
        if (tokenData.error === "authorization_pending") {
          return res.status(200).json({ status: "pending" });
        }
        if (tokenData.error === "slow_down") {
          return res.status(200).json({ status: "pending", retry_after: tokenData.interval || 10 });
        }
        return res.status(400).json({ error: tokenData.error_description || tokenData.error });
      }

      if (!tokenData.access_token) {
        return res.status(200).json({ status: "pending" });
      }

      // User authorized! Retrieve user identity from GitHub
      const ghUserRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "QronosAI-CLI",
        },
      });
      const ghUser = (await ghUserRes.json()) as any;

      // Retrieve verified email
      let email = ghUser.email;
      if (!email) {
        const ghEmailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "QronosAI-CLI",
          },
        });
        if (ghEmailsRes.ok) {
          const emails = (await ghEmailsRes.json()) as any[];
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
          if (primary) email = primary.email;
        }
      }

      if (!email) {
        email = `${ghUser.id}+${ghUser.login}@users.noreply.github.com`;
      }

      // Resolve or create account in Qronos database
      const result = await resolveGitHubIdentity({
        providerUserId: String(ghUser.id),
        email,
        name: ghUser.name || ghUser.login || email.split("@")[0],
        accountCreatedAt: ghUser.created_at ? new Date(ghUser.created_at) : undefined,
      });

      if (result.kind !== "resolved") {
        return res.status(400).json({ error: "Account resolution failed" });
      }

      const user = result.user;
      const creditAccount = await ensureCreditAccount(user.id);
      const currentTokens = Number((creditAccount as any)?.codingPlanTokens ?? 0);

      // Welcome Grant: If user has 0 codingPlanTokens, grant 10,000,000 tokens (10M Tokens Free!)
      if (currentTokens === 0) {
        try {
          await grantAdminAccountCredit({
            userId: user.id,
            actorUserId: 1,
            amountNanos: 0,
            amountTokens: 10_000_000,
            balanceType: "tokens",
          });
          console.log(`[Device Auth] Granted 10M welcome tokens to user #${user.id} (${user.email})`);
        } catch (grantErr) {
          console.warn("[Device Auth] Welcome token grant warning:", grantErr);
        }
      }

      // Generate or retrieve persistent API key for Qronos CLI
      const db = await getDb();
      let keyToReturn = "";
      if (db) {
        const existingKeys = await db
          .select()
          .from(apiKeys)
          .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.status, "active"), eq(apiKeys.label, "Qronos CLI")))
          .limit(1);

        const secret = `qr_${randomBytes(32).toString("base64url")}`;
        const keyPrefix = `${secret.slice(0, 15)}…`;
        const keyHash = hashApiKey(secret);

        if (existingKeys.length > 0) {
          await db
            .update(apiKeys)
            .set({ keyPrefix, keyHash, lastUsedAt: new Date() })
            .where(eq(apiKeys.id, existingKeys[0]!.id));
        } else {
          await db.insert(apiKeys).values({
            userId: user.id,
            label: "Qronos CLI",
            keyPrefix,
            keyHash,
            keyGroup: "coding_plan",
          });
        }
        keyToReturn = secret;
      }

      sess.token = keyToReturn;
      return res.status(200).json({ token: keyToReturn });
    } catch (err: any) {
      console.error("[Device Auth] error in handleTokenPoll:", err);
      return res.status(500).json({ error: err.message || "Failed to process token exchange" });
    }
  };

  app.post("/auth/token", handleTokenPoll);
  app.post("/api/auth/token", handleTokenPoll);

  // 4. GET /client-version - Handshake endpoint for CLI version and model routing
  const handleClientVersion = (_req: Request, res: Response) => {
    const models = TOKENFORGE_MODEL_CATALOGUE.map((m) => ({
      id: m.id,
      name: `${m.displayName} (${m.providerName})`,
    }));

    return res.status(200).json({
      min: "1.0.0",
      latest: "1.0.1",
      model: "claude-sonnet-5.5",
      notice: "⚡ Welcome to Qronos CLI — autonomous AI coding agent. 10M tokens active.",
      models,
    });
  };

  app.get("/client-version", handleClientVersion);
  app.get("/api/client-version", handleClientVersion);

  // 5. GET /me & GET /me/stats - Account allowance and usage metrics for CLI
  const handleMe = async (req: Request, res: Response) => {
    try {
      const resolved = await resolveCliUser(req);
      if (!resolved) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { user, creditAccount } = resolved;
      const tokens = Math.max(0, Number((creditAccount as any)?.codingPlanTokens ?? 0));
      const paygDollars = Number(creditAccount?.paygBalanceNanos ?? 0) / 1_000_000_000;

      return res.status(200).json({
        user_id: String(user.id),
        handle: user.name || user.email.split("@")[0] || "developer",
        remaining_usd_today: tokens > 0 ? tokens / 1_000_000 : 0,
        cap_usd_today: 10,
        tier: "established",
        credit_usd: paygDollars,
        allowance_credits: Math.max(tokens, 10_000_000),
        remaining_credits_today: tokens,
        refill_at: new Date(Date.now() + 86400000).toISOString(),
        lane: "standard",
        bonus_credits: 0,
      });
    } catch (err: any) {
      console.warn("[Device Auth] /me error:", err);
      return res.status(500).json({ error: "Failed to load account profile" });
    }
  };

  app.get("/me", handleMe);
  app.get("/api/me", handleMe);

  const handleMeStats = async (req: Request, res: Response) => {
    try {
      const resolved = await resolveCliUser(req);
      if (!resolved) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { user, creditAccount } = resolved;
      const tokens = Math.max(0, Number((creditAccount as any)?.codingPlanTokens ?? 0));
      const paygDollars = Number(creditAccount?.paygBalanceNanos ?? 0) / 1_000_000_000;

      return res.status(200).json({
        user_id: String(user.id),
        handle: user.name || user.email.split("@")[0] || "developer",
        tier: "established",
        cap_usd_today: 10,
        spent_usd_today: 0,
        remaining_usd_today: tokens > 0 ? tokens / 1_000_000 : 0,
        credit_usd: paygDollars,
        credit_credits: tokens,
        allowance_credits: Math.max(tokens, 10_000_000),
        remaining_credits_today: tokens,
        refill_at: new Date(Date.now() + 86400000).toISOString(),
        lane: "standard",
        bonus_credits: 0,
        request_count_today: 0,
        prompt_tokens_today: 0,
        completion_tokens_today: 0,
        lifetime: {
          spent_usd: Number(user.lifetimeSpendNanos ?? 0) / 1_000_000_000,
          prompt_tokens: 0,
          completion_tokens: 0,
          request_count: 0,
        },
      });
    } catch (err: any) {
      console.warn("[Device Auth] /me/stats error:", err);
      return res.status(500).json({ error: "Failed to load account usage statistics" });
    }
  };

  app.get("/me/stats", handleMeStats);
  app.get("/api/me/stats", handleMeStats);
}
