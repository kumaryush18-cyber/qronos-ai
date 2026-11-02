import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { sql, eq, desc } from "drizzle-orm";
import { getDb, applyReferralCommissionForRecharge, setUserTier, type UserTier } from "./db";
import { users, creditAccounts, creditLedger, processedWebhooks } from "../drizzle/schema";
import { sdk } from "./_core/sdk";

export const DEFAULT_WHOP_WEBHOOK_SECRET = "ws_2e999f5dc62963e37d850099325994f0740271c4c87ea4275b635e98f60b43a0";
export const WHOP_10_CREDITS_PRODUCT_ID = "prod_rkBc5ZhKDEuoj";
export const WHOP_10_CREDITS_PLAN_ID = "plan_HyuPDpV4lHx4Q";
export const WHOP_10_CHECKOUT_URL = "https://whop.com/qronos/10-credits-a922/";

export interface WhopProductSpec {
  productId: string;
  name: string;
  type: "payg" | "token_plan";
  amountUsd: number;
  tokens?: number;
  tier?: UserTier;
  checkoutUrl: string;
}

export const WHOP_PRODUCT_CATALOG: Record<string, WhopProductSpec> = {
  // PAYG products
  prod_rkBc5ZhKDEuoj: { productId: "prod_rkBc5ZhKDEuoj", name: "Qronos $10 API", type: "payg", amountUsd: 10, checkoutUrl: "https://whop.com/qronos/10-credits-a922/" },
  prod_i3lKrClSyu980: { productId: "prod_i3lKrClSyu980", name: "Qronos $15 API", type: "payg", amountUsd: 15, checkoutUrl: "https://whop.com/qronos/15-credit/" },
  prod_Zdm87aTZvrJ1s: { productId: "prod_Zdm87aTZvrJ1s", name: "Qronos $20 API", type: "payg", amountUsd: 20, checkoutUrl: "https://whop.com/qronos/20-credits-19sf/" },
  prod_eJZIbCcgJTeOA: { productId: "prod_eJZIbCcgJTeOA", name: "Qronos $25 API", type: "payg", amountUsd: 25, checkoutUrl: "https://whop.com/qronos/25-credits-fg45/" },
  prod_UyoLvuUlzh35D: { productId: "prod_UyoLvuUlzh35D", name: "Qronos $30 API", type: "payg", amountUsd: 30, checkoutUrl: "https://whop.com/qronos/30-credits-78dg/" },
  prod_sPD4u3nUGMjn2: { productId: "prod_sPD4u3nUGMjn2", name: "Qronos 50 API", type: "payg", amountUsd: 50, checkoutUrl: "https://whop.com/qronos/50-credits-67vb/" },
  prod_lq2bnZMeggT5d: { productId: "prod_lq2bnZMeggT5d", name: "Qronos $100 API", type: "payg", amountUsd: 100, checkoutUrl: "https://whop.com/qronos/100-credits-34jk/" },
  prod_NanmzIYeu3uIo: { productId: "prod_NanmzIYeu3uIo", name: "Qronos $150 API", type: "payg", amountUsd: 150, checkoutUrl: "https://whop.com/qronos/150-credits-19sk/" },
  prod_K0FFsZEoV0fth: { productId: "prod_K0FFsZEoV0fth", name: "Qronos $200 API", type: "payg", amountUsd: 200, checkoutUrl: "https://whop.com/qronos/200-credits-39gh/" },

  // Token plans with automatic tier upgrade mapping
  prod_RunCJULyHjSGZ: { productId: "prod_RunCJULyHjSGZ", name: "Qronos Plus Plan", type: "token_plan", amountUsd: 10, tokens: 600_000_000, tier: "plus", checkoutUrl: "https://whop.com/qronos/plus-plan-24sl/" },
  prod_R6KnsUgI3vA6z: { productId: "prod_R6KnsUgI3vA6z", name: "Qronos Pro Plan", type: "token_plan", amountUsd: 30, tokens: 2_000_000_000, tier: "pro", checkoutUrl: "https://whop.com/qronos/pro-plan-40op/" },
  prod_pNbqUYr7erKsN: { productId: "prod_pNbqUYr7erKsN", name: "Qronos Ultra Plan", type: "token_plan", amountUsd: 60, tokens: 4_600_000_000, tier: "ultra", checkoutUrl: "https://whop.com/qronos/ultra-plan-67wm/" },
  prod_4hC8vZztBBGQm: { productId: "prod_4hC8vZztBBGQm", name: "Qronos Enterprise Plan", type: "token_plan", amountUsd: 150, tokens: 13_000_000_000, tier: "enterprise", checkoutUrl: "https://whop.com/qronos/enterprise-plan-29wm/" },
};

export function resolveWhopProduct(
  productId: string,
  planId: string,
  amountUsd: number,
  rawData: any
): {
  type: "token_plan" | "payg";
  name: string;
  tokens?: number;
  tokensToGrant?: number;
  tier?: UserTier;
  amountUsd: number;
} {
  const byId = WHOP_PRODUCT_CATALOG[productId];
  if (byId) {
    return {
      type: byId.type,
      name: byId.name,
      tokens: byId.tokens,
      tokensToGrant: byId.tokens,
      tier: byId.tier,
      amountUsd: byId.amountUsd,
    };
  }

  const nameCandidate = String(rawData?.product?.name || rawData?.plan?.name || rawData?.title || "").toLowerCase();

  if (nameCandidate.includes("plus") || productId === "prod_RunCJULyHjSGZ" || (amountUsd === 10 && nameCandidate.includes("plan"))) {
    return { type: "token_plan", name: "Qronos Plus Plan", tokens: 600_000_000, tokensToGrant: 600_000_000, tier: "plus", amountUsd: 10 };
  }
  if (nameCandidate.includes("pro") || productId === "prod_R6KnsUgI3vA6z" || (amountUsd === 30 && nameCandidate.includes("plan"))) {
    return { type: "token_plan", name: "Qronos Pro Plan", tokens: 2_000_000_000, tokensToGrant: 2_000_000_000, tier: "pro", amountUsd: 30 };
  }
  if (nameCandidate.includes("ultra") || productId === "prod_pNbqUYr7erKsN" || (amountUsd === 60 && nameCandidate.includes("plan"))) {
    return { type: "token_plan", name: "Qronos Ultra Plan", tokens: 4_600_000_000, tokensToGrant: 4_600_000_000, tier: "ultra", amountUsd: 60 };
  }
  if (nameCandidate.includes("enterprise") || productId === "prod_4hC8vZztBBGQm" || (amountUsd === 150 && nameCandidate.includes("plan"))) {
    return { type: "token_plan", name: "Qronos Enterprise Plan", tokens: 13_000_000_000, tokensToGrant: 13_000_000_000, tier: "enterprise", amountUsd: 150 };
  }

  // Default to PAYG top-up by amount
  return {
    type: "payg",
    name: `Qronos $${Math.round(amountUsd)} API`,
    amountUsd,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeTimingCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies Whop webhook signature:
 * Calculates HMAC-SHA256 of `{whop-webhook-id}.{whop-timestamp}.{raw_body}` using WHOP_WEBHOOK_SECRET.
 * Supports both hex and base64 digest formats and optional v1, or v1= prefixes.
 */
export function verifyWhopWebhookSignature(
  webhookId: string,
  timestamp: string,
  rawBody: Buffer | string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!webhookId || !timestamp || !rawBody || !signatureHeader || !secret) {
    return false;
  }

  const rawBodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const payloadToSign = `${webhookId}.${timestamp}.${rawBodyStr}`;

  const secretsToTest = [secret.trim()];
  if (secret.startsWith("ws_")) {
    secretsToTest.push(secret.slice(3).trim());
  }

  // Parse all signatures from header (comma or whitespace separated)
  const candidateSigs = signatureHeader
    .split(/[\s,]+/)
    .map((s) => s.replace(/^(v1|sha256)=?/, "").trim())
    .filter(Boolean);

  for (const s of secretsToTest) {
    const hmacHex = crypto.createHmac("sha256", s).update(payloadToSign).digest("hex");
    const hmacBase64 = crypto.createHmac("sha256", s).update(payloadToSign).digest("base64");

    for (const candidate of candidateSigs) {
      if (safeTimingCompare(candidate, hmacHex) || safeTimingCompare(candidate, hmacBase64)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Ensure `processed_webhooks` table exists in the database.
 */
export async function ensureProcessedWebhooksTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS processed_webhooks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        webhook_id VARCHAR(191) NOT NULL UNIQUE,
        provider VARCHAR(64) NOT NULL DEFAULT 'whop',
        event_type VARCHAR(128) NOT NULL,
        payload MEDIUMTEXT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY processed_webhooks_webhook_id_idx (webhook_id),
        INDEX processed_webhooks_provider_idx (provider),
        INDEX processed_webhooks_processed_at_idx (processed_at)
      );
    `);
  } catch (err) {
    console.warn("[Whop Gateway] ensureProcessedWebhooksTable error:", err);
  }
}

/**
 * Register Whop Webhook handler on the Express server.
 * Listens on:
 * - POST /api/webhooks/whop (Canonical Whop webhook endpoint)
 * - POST /api/payments/whop/webhook (Alternative alias)
 */
export function registerWhopPaymentGateway(app: Express): void {
  // Ensure table on server boot
  ensureProcessedWebhooksTable().catch((e) =>
    console.error("[Whop Gateway] Table init failed:", e)
  );

  app.post(
    ["/api/webhooks/whop", "/api/payments/whop/webhook"],
    async (req: Request, res: Response) => {
      const startTime = Date.now();

      try {
        // 1. Extract Whop Webhook headers
        const webhookId = (
          req.headers["whop-webhook-id"] ||
          req.headers["webhook-id"] ||
          req.headers["x-whop-webhook-id"] ||
          ""
        ).toString().trim();

        const timestamp = (
          req.headers["whop-timestamp"] ||
          req.headers["webhook-timestamp"] ||
          req.headers["x-whop-timestamp"] ||
          ""
        ).toString().trim();

        const signatureHeader = (
          req.headers["whop-signature"] ||
          req.headers["webhook-signature"] ||
          req.headers["x-whop-signature"] ||
          ""
        ).toString().trim();

        const webhookSecret = (process.env.WHOP_WEBHOOK_SECRET || DEFAULT_WHOP_WEBHOOK_SECRET || "").trim();

        if (!webhookSecret) {
          console.error("[Whop Webhook] WHOP_WEBHOOK_SECRET is not configured in environment.");
          return res.status(500).json({ error: "Whop webhook secret unconfigured on server." });
        }

        // 2. Validate raw request body
        const rawBody = (req as any).rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
        if (!rawBody) {
          console.warn("[Whop Webhook] Missing raw body on incoming webhook request.");
          return res.status(400).json({ error: "Missing raw request payload for webhook verification." });
        }

        // 3. Verify HMAC-SHA256 signature
        const isValidSignature = verifyWhopWebhookSignature(
          webhookId,
          timestamp,
          rawBody,
          signatureHeader,
          webhookSecret
        );

        if (!isValidSignature) {
          console.warn("[Whop Webhook] 401 Unauthorized: Signature verification failed.", {
            webhookId,
            timestamp,
            hasSignatureHeader: Boolean(signatureHeader),
          });
          return res.status(401).json({ error: "Invalid or missing Whop webhook signature." });
        }

        // 4. Parse payload
        let payload: any;
        try {
          payload = typeof req.body === "object" && !Buffer.isBuffer(req.body)
            ? req.body
            : JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
        } catch (jsonErr) {
          console.error("[Whop Webhook] Failed to parse JSON payload:", jsonErr);
          return res.status(400).json({ error: "Malformed JSON payload." });
        }

        const eventType = (
          payload.action ||
          payload.type ||
          payload.event_type ||
          payload.event ||
          ""
        ).toString().trim();

        const db = await getDb();
        if (!db) {
          return res.status(500).json({ error: "Database temporarily unavailable." });
        }

        // 5. Idempotency Check: check if whop-webhook-id was already processed
        if (webhookId) {
          const [existingWebhook] = await db
            .select({ id: processedWebhooks.id })
            .from(processedWebhooks)
            .where(eq(processedWebhooks.webhookId, webhookId))
            .limit(1);

          if (existingWebhook) {
            console.log(`[Whop Webhook] Webhook ID ${webhookId} was already processed. Returning 200 OK immediately.`);
            return res.status(200).json({
              success: true,
              received: true,
              message: "Webhook ID already processed (idempotent duplicate skipped).",
            });
          }
        }

        // 6. Verify event type is payment.succeeded
        if (eventType !== "payment.succeeded") {
          console.log(`[Whop Webhook] Non-payment event '${eventType}' acknowledged without credit disbursement.`);
          if (webhookId) {
            await db.insert(processedWebhooks).values({
              webhookId,
              provider: "whop",
              eventType: eventType || "unspecified",
              payload: JSON.stringify(payload).slice(0, 5000),
            }).catch(() => {});
          }
          return res.status(200).json({
            success: true,
            received: true,
            note: `Event '${eventType}' acknowledged without balance change.`,
          });
        }

        // 7. Extract customer email, amount paid, and product/plan ID
        const data = payload.data || payload;
        const customerEmail = (
          data.email ||
          data.customer?.email ||
          data.user?.email ||
          data.customer_email ||
          payload.user?.email ||
          payload.customer?.email ||
          ""
        ).toString().toLowerCase().trim();

        const rawAmount = data.amount ?? data.total ?? data.subtotal ?? data.final_amount ?? 10;
        const currency = (data.currency || "usd").toString().toLowerCase();

        // Amount normalization: in cents (e.g. 1000) or dollars (10.0 or 10)
        let amountUsd = typeof rawAmount === "string" ? parseFloat(rawAmount) : Number(rawAmount);
        if (amountUsd > 100 && currency === "usd") {
          amountUsd = amountUsd / 100;
        }
        if (isNaN(amountUsd) || amountUsd <= 0) {
          amountUsd = 10;
        }

        const productId = (
          data.product_id ||
          data.product?.id ||
          data.product ||
          ""
        ).toString().trim();

        const planId = (
          data.plan_id ||
          data.plan?.id ||
          data.plan ||
          ""
        ).toString().trim();

        const paymentId = (data.payment_id || data.id || webhookId || "").toString().trim();

        const resolved = resolveWhopProduct(productId, planId, amountUsd, data);
        const amountNanos = Math.round(amountUsd * 1_000_000_000);

        console.log(`[Whop Webhook] Processing ${resolved.type}: "${resolved.name}" for customer ${customerEmail} ($${amountUsd})`);

        // 9. Look up user by email
        if (!customerEmail) {
          console.error("[Whop Webhook] Missing customer email in payment.succeeded payload:", data);
          if (webhookId) {
            await db.insert(processedWebhooks).values({
              webhookId,
              provider: "whop",
              eventType,
              payload: JSON.stringify(payload).slice(0, 5000),
            }).catch(() => {});
          }
          return res.status(200).json({
            success: true,
            warning: "Customer email missing in payload; webhook recorded without disbursement.",
          });
        }

        const [user] = await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(eq(sql`LOWER(${users.email})`, customerEmail))
          .limit(1);

        // 10. Execute atomic balance increment & log webhook as processed
        if (user) {
          await db.transaction(async (tx) => {
            // Ensure credit account exists
            await tx.insert(creditAccounts).values({
              userId: user.id,
              balanceNanos: 0,
              paygBalanceNanos: 0,
              codingPlanTokens: 0,
            }).onDuplicateKeyUpdate({ set: { userId: user.id } });

            if (resolved.type === "token_plan") {
              const tokensToAdd = resolved.tokensToGrant || 600_000_000;
              await tx.update(creditAccounts)
                .set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${tokensToAdd}` })
                .where(eq(creditAccounts.userId, user.id));

              // Fetch updated balance for ledger
              const [acc] = await tx
                .select({ codingPlanTokens: creditAccounts.codingPlanTokens, paygBalanceNanos: creditAccounts.paygBalanceNanos })
                .from(creditAccounts)
                .where(eq(creditAccounts.userId, user.id))
                .limit(1);

              const newBalanceNanos = Number(acc?.paygBalanceNanos ?? 0);

              // Audit ledger entry
              await tx.insert(creditLedger).values({
                userId: user.id,
                kind: "manual_adjustment",
                amountNanos: 0,
                balanceAfterNanos: newBalanceNanos,
                referenceId: `whop_token_plan:${paymentId}`,
                note: `Whop Token Plan Purchase: ${resolved.name} (+${(tokensToAdd / 1_000_000).toFixed(0)}M Tokens, $${amountUsd}). Webhook: ${webhookId}`,
              });

              // Automatically upgrade account tier if a token plan was purchased (e.g. Plus, Pro, Ultra, Enterprise)
              if (resolved.tier) {
                await setUserTier(user.id, resolved.tier);
                console.log(`[Whop Webhook] Automatically upgraded user #${user.id} (${user.email}) to ${resolved.tier.toUpperCase()} tier.`);
              }

              console.log(`[Whop Webhook] Successfully credited +${(tokensToAdd / 1_000_000).toFixed(0)}M Tokens to user #${user.id} (${user.email}).`);
            } else {
              // PAYG top-up
              await tx.update(creditAccounts)
                .set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${amountNanos}` })
                .where(eq(creditAccounts.userId, user.id));

              // Fetch updated balance for ledger
              const [acc] = await tx
                .select({ paygBalanceNanos: creditAccounts.paygBalanceNanos })
                .from(creditAccounts)
                .where(eq(creditAccounts.userId, user.id))
                .limit(1);

              const newBalanceNanos = Number(acc?.paygBalanceNanos ?? amountNanos);

              // Audit ledger entry
              await tx.insert(creditLedger).values({
                userId: user.id,
                kind: "manual_adjustment",
                amountNanos: amountNanos,
                balanceAfterNanos: newBalanceNanos,
                referenceId: `whop_pay:${paymentId}`,
                note: `Whop Payment Top-Up: $${amountUsd.toFixed(2)} PAYG Balance (${resolved.name}). Webhook: ${webhookId}`,
              });

              console.log(`[Whop Webhook] Successfully credited +$${amountUsd.toFixed(2)} PAYG balance to user #${user.id} (${user.email}).`);
            }

            // Trigger referral commission for user's referrer (25% of amount paid)
            await applyReferralCommissionForRecharge(
              tx,
              user.id,
              amountNanos,
              paymentId,
              "Whop Card"
            );

            // Mark webhook as processed
            if (webhookId) {
              await tx.insert(processedWebhooks).values({
                webhookId,
                provider: "whop",
                eventType,
                payload: JSON.stringify({
                  userId: user.id,
                  email: customerEmail,
                  amountUsd,
                  productId,
                  planId,
                  paymentId,
                  productName: resolved.name,
                  productType: resolved.type,
                  status: "credited",
                }),
              });
            }
          });
        } else {
          // Users MUST have an existing registered account in Qronos to receive a top-up.
          console.warn(`[Whop Webhook] Refusing credit top-up: No registered Qronos account found for email: ${customerEmail}.`);

          if (webhookId) {
            await db.insert(processedWebhooks).values({
              webhookId,
              provider: "whop",
              eventType,
              payload: JSON.stringify({
                unregisteredEmail: customerEmail,
                amountUsd,
                productId,
                planId,
                paymentId,
                status: "account_not_found",
              }),
            }).catch(() => {});
          }

          return res.status(200).json({
            success: false,
            error: "account_not_found",
            message: `User with email ${customerEmail} does not have an account in Qronos. Top-up requires an existing account.`,
          });
        }

        const elapsedMs = Date.now() - startTime;
        console.log(`[Whop Webhook] Completed processing in ${elapsedMs}ms.`);

        // 12. Return 200 OK within 3 seconds
        return res.status(200).json({
          success: true,
          message: "Payment verified and credited successfully.",
          creditedUsd: amountUsd,
          customerEmail,
          elapsedMs,
        });
      } catch (err: any) {
        console.error("[Whop Webhook] Error processing webhook:", err);
        return res.status(500).json({ error: err?.message || "Internal webhook processing error." });
      }
    }
  );

  // Admin endpoint to list all Whop transactions in Settlements workspace
  app.get("/api/admin/whop/orders", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || !user.isAdminSession) {
        return res.status(403).json({ success: false, error: "Admin authorization required." });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ success: false, error: "Database unavailable." });

      const rows = await db
        .select()
        .from(processedWebhooks)
        .where(eq(processedWebhooks.provider, "whop"))
        .orderBy(desc(processedWebhooks.processedAt))
        .limit(100);

      const orders = rows.map((r) => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(r.payload || "{}");
        } catch {}
        return {
          id: r.id,
          webhookId: r.webhookId,
          orderId: parsed.paymentId || r.webhookId,
          paymentId: parsed.paymentId || null,
          userId: parsed.userId || null,
          userEmail: parsed.email || null,
          amountUsd: Number(parsed.amountUsd || 0),
          productName: parsed.productName || "Qronos Plus Plan",
          productType: parsed.productType || "token_plan",
          tokens: parsed.tokens || (parsed.productName?.includes("Plus") ? 600_000_000 : parsed.productName?.includes("Pro") ? 2_200_000_000 : parsed.productName?.includes("Ultra") ? 5_000_000_000 : 0),
          status: "COMPLETED",
          processedAt: r.processedAt,
        };
      });

      const totalVolumeUsd = orders.reduce((sum, o) => sum + (o.amountUsd || 0), 0);
      const totalTokensCredited = orders.reduce((sum, o) => sum + (o.tokens || 0), 0);

      return res.json({
        success: true,
        total_orders: orders.length,
        total_volume_usd: Number(totalVolumeUsd.toFixed(2)),
        total_tokens_credited: totalTokensCredited,
        orders,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // User endpoint to view own Whop settlements
  app.get("/api/whop/my-orders", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ success: false, error: "Authentication required." });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ success: false, error: "Database unavailable." });

      const rows = await db
        .select()
        .from(processedWebhooks)
        .where(eq(processedWebhooks.provider, "whop"))
        .orderBy(desc(processedWebhooks.processedAt))
        .limit(50);

      const myOrders = rows
        .map((r) => {
          let parsed: any = {};
          try {
            parsed = JSON.parse(r.payload || "{}");
          } catch {}
          return {
            id: r.id,
            orderId: parsed.paymentId || r.webhookId,
            userId: parsed.userId,
            userEmail: parsed.email,
            amountUsd: Number(parsed.amountUsd || 0),
            productName: parsed.productName || "Qronos Plan",
            tokens: parsed.tokens || (parsed.productName?.includes("Plus") ? 600_000_000 : 0),
            status: "COMPLETED",
            processedAt: r.processedAt,
          };
        })
        .filter((o) => o.userId === user.id || (user.email && o.userEmail === user.email));

      return res.json({ success: true, orders: myOrders });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
}
