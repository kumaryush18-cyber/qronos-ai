import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { sql, eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, creditAccounts, creditLedger, processedWebhooks, preProvisionedAccounts } from "../drizzle/schema";
import { applyReferralCommissionForRecharge } from "./db";

export const DEFAULT_WHOP_WEBHOOK_SECRET = "ws_2e999f5dc62963e37d850099325994f0740271c4c87ea4275b635e98f60b43a0";
export const WHOP_10_CREDITS_PRODUCT_ID = "prod_rkBc5ZhKDEuoj";
export const WHOP_10_CREDITS_PLAN_ID = "plan_HyuPDpV4lHx4Q";
export const WHOP_10_CHECKOUT_URL = "https://whop.com/qronos/10-credits-a922/";

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

        // 8. Verify product matches our $10 Qronos API Credit product
        const configuredProductId = (process.env.WHOP_10_CREDITS_PRODUCT_ID || WHOP_10_CREDITS_PRODUCT_ID).trim();
        const configuredPlanId = (process.env.WHOP_10_CREDITS_PLAN_ID || WHOP_10_CREDITS_PLAN_ID).trim();

        const is10DollarProduct =
          productId === configuredProductId ||
          planId === configuredPlanId ||
          productId === WHOP_10_CREDITS_PRODUCT_ID ||
          planId === WHOP_10_CREDITS_PLAN_ID ||
          Math.round(amountUsd) === 10;

        if (!is10DollarProduct) {
          console.warn(`[Whop Webhook] Product/Plan (${productId}/${planId}) does not match $10 Qronos API Credit product. Received amount: $${amountUsd}`);
        }

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

        const amountNanos = Math.round(amountUsd * 1_000_000_000);

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

            // Increment PAYG balance by amount paid
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
              note: `Whop Payment Top-Up: $${amountUsd.toFixed(2)} PAYG Balance (Product: ${productId || "Qronos $10 API"}). Webhook: ${webhookId}`,
            });

            // Trigger referral commission for user's referrer
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
                }),
              });
            }
          });

          console.log(`[Whop Webhook] Successfully credited +$${amountUsd.toFixed(2)} PAYG balance to user #${user.id} (${user.email}).`);
        } else {
          // User has not signed up on Qronos with this email yet. Pre-provision credits so they are ready upon registration!
          await db.transaction(async (tx) => {
            await tx.insert(preProvisionedAccounts).values({
              email: customerEmail,
              introductoryCreditNanos: amountNanos,
            }).onDuplicateKeyUpdate({
              set: {
                introductoryCreditNanos: sql`${preProvisionedAccounts.introductoryCreditNanos} + ${amountNanos}`,
              },
            });

            if (webhookId) {
              await tx.insert(processedWebhooks).values({
                webhookId,
                provider: "whop",
                eventType,
                payload: JSON.stringify({
                  preProvisionedEmail: customerEmail,
                  amountUsd,
                  productId,
                  planId,
                  paymentId,
                }),
              });
            }
          });

          console.log(`[Whop Webhook] Pre-provisioned +$${amountUsd.toFixed(2)} credits for upcoming user registration: ${customerEmail}`);
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
}
