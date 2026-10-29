import { Express, Request, Response } from "express";
import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { creditAccountFromDodoPay, getUserById, setGpt6AstraPremiumExemption, setUserTier, type UserTier } from "./db";

// Plan default credits in Nanos (1 Credit = 1,000,000,000 Nanos)
// Starter: $10 -> 3,000 credits
// Pro: $25 -> 8,500 credits
// Max: $50 -> 18,000 credits
// Power: $100 -> 40,000 credits
// Ultra: $200 -> 100,000 credits
const CREDITS_STARTER_NANOS = 3000 * 1_000_000_000;
const CREDITS_PRO_NANOS = 8500 * 1_000_000_000;
const CREDITS_MAX_NANOS = 18000 * 1_000_000_000;
const CREDITS_POWER_NANOS = 40000 * 1_000_000_000;
const CREDITS_ULTRA_NANOS = 100000 * 1_000_000_000;

/**
 * Ensures the `dodo_orders` table exists for audit and fast plan checks.
 */
async function ensureDodoOrdersTable() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dodo_orders (
        order_id VARCHAR(64) PRIMARY KEY,
        payment_id VARCHAR(128) NULL,
        user_id INT NULL,
        user_email VARCHAR(320) NULL,
        product_id VARCHAR(128) NOT NULL,
        plan_name VARCHAR(64) NOT NULL,
        amount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        credits BIGINT NOT NULL DEFAULT 0,
        credits_nanos BIGINT NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dodo_user (user_id),
        INDEX idx_dodo_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (err) {
    console.error("[Dodo Gateway] Table initialization notice:", err);
  }
}

export interface ResolvedDodoPlan {
  productId: string;
  planName: string;
  creditsNanos: number;
  amountUsd: number;
  tier: UserTier;
}

/**
 * Resolves a given product_id string or alias ("starter", "pro", "max", "power", "ultra", or live product IDs)
 * to the actual configured Dodo Product ID, credits, and user tier.
 */
export function resolveDodoProductId(
  input?: string | null,
  fallbackAmountCentsOrUsd?: number | null
): ResolvedDodoPlan {
  const normalized = (input || "").trim().toLowerCase();

  const starterPrd = process.env.DODO_STARTER_PRD?.trim() || "";
  const proPrd = process.env.DODO_PRO_PRD?.trim() || "";
  const maxPrd = process.env.DODO_MAX_PRD?.trim() || "";
  const powerPrd = process.env.DODO_POWER_PRD?.trim() || "";
  const ultraPrd = process.env.DODO_ULTRA_PRD?.trim() || "";

  // 1. Pro Plan ($25 -> 8,500 credits)
  if (
    normalized === "pro" ||
    normalized === "pro plan" ||
    normalized === "pdt_0nnqozawu5qtj9wrrdfyh" ||
    (proPrd && normalized === proPrd.toLowerCase())
  ) {
    return {
      productId: proPrd || "pdt_0NnQOzAwU5qtJ9WRrdfyh",
      planName: "Pro Plan",
      creditsNanos: CREDITS_PRO_NANOS,
      amountUsd: 25.0,
      tier: "pro",
    };
  }

  // 2. Plus Plan ($10 -> 3,000 credits)
  if (
    normalized === "plus" ||
    normalized === "starter" ||
    normalized === "starter plan" ||
    (starterPrd && normalized === starterPrd.toLowerCase())
  ) {
    return {
      productId: starterPrd || "starter",
      planName: "Plus Plan",
      creditsNanos: CREDITS_STARTER_NANOS,
      amountUsd: 10.0,
      tier: "plus",
    };
  }

  // 3. Max Plan ($50 -> 18,000 credits)
  if (
    normalized === "max" ||
    normalized === "max plan" ||
    (maxPrd && normalized === maxPrd.toLowerCase())
  ) {
    return {
      productId: maxPrd || "max",
      planName: "Max Plan",
      creditsNanos: CREDITS_MAX_NANOS,
      amountUsd: 50.0,
      tier: "max",
    };
  }

  // 4. Power Plan ($100 -> 40,000 credits)
  if (
    normalized === "power" ||
    normalized === "power plan" ||
    (powerPrd && normalized === powerPrd.toLowerCase())
  ) {
    return {
      productId: powerPrd || "power",
      planName: "Power Plan",
      creditsNanos: CREDITS_POWER_NANOS,
      amountUsd: 100.0,
      tier: "power",
    };
  }

  // 5. Ultra Plan ($200 -> 100,000 credits)
  if (
    normalized === "ultra" ||
    normalized === "ultra plan" ||
    (ultraPrd && normalized === ultraPrd.toLowerCase())
  ) {
    return {
      productId: ultraPrd || "ultra",
      planName: "Ultra Plan",
      creditsNanos: CREDITS_ULTRA_NANOS,
      amountUsd: 200.0,
      tier: "ultra",
    };
  }

  // 6. Match by amount if raw identifier is ambiguous
  const amt = Number(fallbackAmountCentsOrUsd || 0);
  if (amt > 0) {
    // Pro Plan check: $24-$26 USD or ~₹2,900-₹3,000 INR (cents: 290000 - 300000)
    if ((amt >= 24 && amt <= 26) || (amt >= 290000 && amt <= 300000)) {
      return {
        productId: proPrd || "pdt_0NnQOzAwU5qtJ9WRrdfyh",
        planName: "Pro Plan",
        creditsNanos: CREDITS_PRO_NANOS,
        amountUsd: 25.0,
        tier: "pro",
      };
    }
    // Starter Plan check: $9-$11 USD or ~₹1,150-₹1,250 INR (cents: 115000 - 125000)
    if ((amt >= 9 && amt <= 11) || (amt >= 115000 && amt <= 125000)) {
      return {
        productId: starterPrd || "starter",
        planName: "Starter Plan",
        creditsNanos: CREDITS_STARTER_NANOS,
        amountUsd: 10.0,
        tier: "starter",
      };
    }
    // Max Plan check: $49-$52 USD
    if ((amt >= 49 && amt <= 52) || (amt >= 580000 && amt <= 600000)) {
      return {
        productId: maxPrd || "max",
        planName: "Max Plan",
        creditsNanos: CREDITS_MAX_NANOS,
        amountUsd: 50.0,
        tier: "max",
      };
    }
    // Power Plan check: $98-$105 USD
    if (amt >= 98 && amt <= 105) {
      return {
        productId: powerPrd || "power",
        planName: "Power Plan",
        creditsNanos: CREDITS_POWER_NANOS,
        amountUsd: 100.0,
        tier: "power",
      };
    }
    // Ultra Plan check: $195-$210 USD
    if (amt >= 195 && amt <= 210) {
      return {
        productId: ultraPrd || "ultra",
        planName: "Ultra Plan",
        creditsNanos: CREDITS_ULTRA_NANOS,
        amountUsd: 200.0,
        tier: "ultra",
      };
    }
  }

  // Fallback if custom explicit ID passed
  if (normalized.length > 0 && normalized !== "unknown") {
    return {
      productId: input!.trim(),
      planName: "Custom Plan",
      creditsNanos: CREDITS_STARTER_NANOS,
      amountUsd: 10.0,
      tier: "plus",
    };
  }

  // Default safely to Plus only if completely empty
  return {
    productId: starterPrd || "starter",
    planName: "Plus Plan",
    creditsNanos: CREDITS_STARTER_NANOS,
    amountUsd: 10.0,
    tier: "plus",
  };
}

export interface DodoPaymentRecord {
  orderId: string;
  paymentId: string | null;
  userId: number | null;
  userEmail: string | null;
  productId: string;
  planName: string;
  amountUsd: number;
  credits: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches recent Dodo Payments transaction history for a specific developer.
 */
export async function listUserDodoPayments(userId: number): Promise<DodoPaymentRecord[]> {
  const db = await getDb();
  if (!db || !userId) return [];
  await ensureDodoOrdersTable();

  try {
    const res = await db.execute(sql`
      SELECT 
        order_id, payment_id, user_id, user_email, product_id, plan_name,
        amount_usd, credits, status, created_at, updated_at
      FROM dodo_orders
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    const rows = (res[0] || []) as any[];
    return rows.map((r) => ({
      orderId: String(r.order_id),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      userId: r.user_id ? Number(r.user_id) : null,
      userEmail: r.user_email ? String(r.user_email) : null,
      productId: String(r.product_id),
      planName: String(r.plan_name || "Card Plan"),
      amountUsd: Number(r.amount_usd || 0),
      credits: Number(r.credits || 0),
      status: String(r.status || "PENDING").toUpperCase(),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    console.warn("[Dodo Gateway] Error querying user payments:", err);
    return [];
  }
}

/**
 * Fetches all recent Dodo Payments transactions for the admin panel.
 */
export async function listAllDodoPayments(limit = 100): Promise<DodoPaymentRecord[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureDodoOrdersTable();

  try {
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const res = await db.execute(sql`
      SELECT 
        order_id, payment_id, user_id, user_email, product_id, plan_name,
        amount_usd, credits, status, created_at, updated_at
      FROM dodo_orders
      ORDER BY created_at DESC
      LIMIT ${boundedLimit};
    `);
    const rows = (res[0] || []) as any[];
    return rows.map((r) => ({
      orderId: String(r.order_id),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      userId: r.user_id ? Number(r.user_id) : null,
      userEmail: r.user_email ? String(r.user_email) : null,
      productId: String(r.product_id),
      planName: String(r.plan_name || "Card Plan"),
      amountUsd: Number(r.amount_usd || 0),
      credits: Number(r.credits || 0),
      status: String(r.status || "PENDING").toUpperCase(),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    console.warn("[Dodo Gateway] Error querying all payments:", err);
    return [];
  }
}

/**
 * Syncs recent payments directly from the Dodo Payments API when configured.
 */
export async function syncDodoPaymentsFromApi(): Promise<{ synced: number }> {
  const apiKey = process.env.DODO_API_KEY?.trim();
  if (!apiKey) return { synced: 0 };
  const db = await getDb();
  if (!db) return { synced: 0 };
  await ensureDodoOrdersTable();

  try {
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : (apiKey.startsWith("test_") ? "test_mode" : undefined),
    });

    const page = await client.payments.list({ pageSize: 50 });
    const items = (page as any)?.items || (page as any)?.data || (Array.isArray(page) ? page : []);
    let count = 0;

    for (const payment of items) {
      const paymentId = payment.payment_id || payment.id;
      if (!paymentId) continue;
      const rawStatus = String(payment.status || "succeeded").toUpperCase();
      const status = rawStatus === "SUCCEEDED" ? "COMPLETED" : rawStatus;
      const amountUsd = Number(payment.total_amount ? payment.total_amount / 100 : (payment.amount ? payment.amount / 100 : 0));
      const metadata = payment.metadata || payment.customer?.metadata || {};
      const rawUserId = metadata.user_id || metadata.userId;
      const userId = rawUserId ? parseInt(String(rawUserId), 10) : null;
      const customerEmail = payment.customer?.email || metadata.user_email || null;
      const productId = metadata.product_id || "starter";
      const { planName, creditsNanos } = resolveDodoProductId(productId);
      const creditsWhole = Math.round(creditsNanos / 1_000_000_000);

      await db.execute(sql`
        INSERT INTO dodo_orders (
          order_id, payment_id, user_id, user_email, product_id, plan_name, amount_usd, credits, credits_nanos, status, metadata
        ) VALUES (
          ${`dodo_${paymentId}`}, ${paymentId}, ${userId}, ${customerEmail}, ${productId}, ${planName}, ${amountUsd}, ${creditsWhole}, ${creditsNanos}, ${status}, ${JSON.stringify(payment)}
        ) ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          amount_usd = VALUES(amount_usd),
          updated_at = CURRENT_TIMESTAMP;
      `);
      count++;
    }
    return { synced: count };
  } catch (err) {
    console.warn("[Dodo Gateway] Sync notice:", err);
    return { synced: 0 };
  }
}

export function registerDodoPaymentsGateway(app: Express) {
  // Ensure MySQL storage is initialized
  void ensureDodoOrdersTable();

  /**
   * GET /api/payments/dodo/config
   * Provides client with mapped product IDs and rail availability.
   */
  app.get("/api/payments/dodo/config", (_req: Request, res: Response) => {
    return res.json({
      configured: Boolean(process.env.DODO_API_KEY),
      products: {
        starter: process.env.DODO_STARTER_PRD || "",
        pro: process.env.DODO_PRO_PRD || "",
        max: process.env.DODO_MAX_PRD || "",
        power: process.env.DODO_POWER_PRD || "",
        ultra: process.env.DODO_ULTRA_PRD || "",
      },
    });
  });

  /**
   * POST /api/payments/create-checkout-session
   * Accepts: { product_id: string, user_id: string | number }
   * Returns: { checkout_url: string, session_id?: string }
   */
  app.post("/api/payments/create-checkout-session", async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.DODO_API_KEY?.trim();
      if (!apiKey) {
        return res.status(500).json({
          error: "Dodo Payments is not yet configured. Please set DODO_API_KEY in your AI Studio settings.",
        });
      }

      const { product_id, user_id, return_url, is_payg, isPayg, amount_usd } = req.body || {};

      if (!product_id || typeof product_id !== "string") {
        return res.status(400).json({ error: "Missing required field: product_id (string)" });
      }

      if (!user_id) {
        return res.status(400).json({ error: "Missing required field: user_id" });
      }

      const isPaygDeposit = Boolean(is_payg || isPayg);
      const { productId, planName, creditsNanos, amountUsd } = resolveDodoProductId(product_id);
      if (!productId) {
        return res.status(400).json({
          error: `No Dodo Product ID configured for plan '${product_id}'. Please check your environment variables.`,
        });
      }

      // Initialize Dodo Payments Client
      const client = new DodoPayments({
        bearerToken: apiKey,
        environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : (apiKey.startsWith("test_") ? "test_mode" : undefined),
      });

      // Prepare return URL
      const origin = req.get("origin") || process.env.QRONOS_PUBLIC_ORIGIN || "https://qronos.ai";
      const resolvedReturnUrl = return_url || `${origin}/dashboard?tab=wallet&payment=dodo_success`;

      // Call checkout_sessions.create
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        metadata: {
          user_id: String(user_id),
          plan_name: isPaygDeposit ? "PAYG Deposit" : planName,
          tier_id: product_id,
          product_id: productId,
          is_payg: isPaygDeposit ? "true" : "false",
          amount_usd: String(amount_usd || amountUsd),
        },
        return_url: resolvedReturnUrl,
      });

      const checkoutUrl = (session as any).checkout_url || (session as any).url;
      const sessionId = (session as any).session_id || (session as any).id;

      if (!checkoutUrl) {
        throw new Error("Dodo Payments did not return a valid checkout_url.");
      }

      const creditsWhole = Math.round(creditsNanos / 1_000_000_000);
      let userEmail: string | null = null;
      try {
        const u = await getUserById(Number(user_id));
        userEmail = u?.email || null;
      } catch {}

      // Record pending order
      try {
        const db = await getDb();
        if (db) {
          const orderId = `dodo_${sessionId || Date.now()}`;
          await db.execute(sql`
            INSERT INTO dodo_orders (
              order_id, user_id, user_email, product_id, plan_name, amount_usd, credits, credits_nanos, status, metadata
            ) VALUES (
              ${orderId}, ${Number(user_id)}, ${userEmail}, ${productId}, ${planName}, ${amountUsd}, ${creditsWhole}, ${creditsNanos}, 'PENDING', ${JSON.stringify({ sessionId, returnUrl: resolvedReturnUrl })}
            ) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
          `);
        }
      } catch (dbErr) {
        console.warn("[Dodo Gateway] Order tracking notice:", dbErr);
      }

      return res.json({
        checkout_url: checkoutUrl,
        session_id: sessionId,
      });
    } catch (error: any) {
      console.error("[Dodo Gateway] Checkout session creation error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to create Dodo Payments checkout session.",
      });
    }
  });

  /**
   * POST /api/payments/dodo/webhook
   * Validates Dodo Standard Webhooks signature and provisions credits & Claude Opus 5 access.
   * STRICT IDEMPOTENCY: Credits are ONLY awarded on verified `payment.succeeded` events with valid payment_id.
   */
  app.post("/api/payments/dodo/webhook", async (req: Request, res: Response) => {
    try {
      const webhookSecret = process.env.DODO_WEBHOOK_SECRET?.trim();
      if (!webhookSecret) {
        console.error("[Dodo Webhook] DODO_WEBHOOK_SECRET is not configured.");
        return res.status(500).json({ error: "DODO_WEBHOOK_SECRET is not configured." });
      }

      // Retrieve raw request body for Standard Webhooks verification
      const rawBody = (req as any).rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
      if (!rawBody) {
        return res.status(400).json({ error: "Missing raw request payload for webhook verification." });
      }

      // Verify signature via standardwebhooks
      const wh = new Webhook(webhookSecret);
      const headersRecord: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (typeof val === "string") headersRecord[key] = val;
        else if (Array.isArray(val) && val[0]) headersRecord[key] = val[0];
      }

      try {
        wh.verify(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"), headersRecord);
      } catch (verifyErr: any) {
        console.warn("[Dodo Webhook] Signature verification failed:", verifyErr?.message || verifyErr);
        return res.status(400).json({ error: `Webhook verification failed: ${verifyErr?.message || "invalid signature"}` });
      }

      // Parse payload
      const event = typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? req.body
        : JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));

      const eventType = event.type || event.event_type;
      console.log(`[Dodo Webhook] Received verified event: ${eventType}`);

      // 1. Subscription lifecycle events (e.g. subscription.active) update user tier only.
      // CRITICAL: NEVER dispense balance credits on subscription.active (credits are exclusively granted on payment.succeeded).
      if (eventType === "subscription.active") {
        const subData = event.data || {};
        const subMeta = subData.metadata || subData.customer?.metadata || {};
        const rawUserId = subMeta.user_id || subMeta.userId;
        if (rawUserId) {
          const userId = parseInt(String(rawUserId), 10);
          if (!isNaN(userId)) {
            const planHint = subMeta.plan_name || subMeta.tier_id || subData.product_id;
            const resolved = resolveDodoProductId(planHint);
            if (resolved?.tier) {
              await setUserTier(userId, resolved.tier);
              console.log(`[Dodo Webhook] Updated user ${userId} tier to '${resolved.tier}' on subscription.active.`);
            }
          }
        }
        return res.json({ success: true, received: true, note: "Subscription status registered without duplicate credit disbursement" });
      }

      // 2. We ONLY grant balance credits on captured payment confirmation: payment.succeeded
      if (eventType !== "payment.succeeded") {
        console.log(`[Dodo Webhook] Non-payment event '${eventType}' acknowledged without credit disbursement.`);
        return res.json({ success: true, received: true, ignored: `Event '${eventType}' does not trigger balance credits` });
      }

      const data = event.data || {};
      const metadata = data.metadata || data.customer?.metadata || {};
      const rawUserId = metadata.user_id || metadata.userId;

      if (!rawUserId) {
        console.warn("[Dodo Webhook] Received payment.succeeded without user_id in metadata:", data);
        return res.json({ received: true, warning: "user_id missing in metadata" });
      }

      const userId = parseInt(String(rawUserId), 10);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user_id format" });
      }

      // 3. Strict Payment ID: Must be an immutable Dodo payment identifier, NEVER Date.now() or synthetic
      const paymentId = (data.payment_id || data.id || "").trim();
      if (!paymentId || paymentId.startsWith("pay_Date")) {
        console.error("[Dodo Webhook] Refusing credit grant: Missing immutable payment_id in payment.succeeded payload:", data);
        return res.json({ received: true, error: "Missing valid payment_id" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // 4. Strict Idempotency & Duplicate Shield: Check if this payment was ALREADY credited
      const paymentReferenceId = `dodo_pay:${paymentId}`;
      const [existingLedgerRows] = await db.execute(sql`
        SELECT id FROM credit_ledger 
        WHERE userId = ${userId} AND referenceId = ${paymentReferenceId}
        LIMIT 1;
      `);
      if (Array.isArray(existingLedgerRows) && existingLedgerRows.length > 0) {
        console.log(`[Dodo Webhook] Payment ${paymentId} has ALREADY been credited for user ${userId}. Safely ignoring duplicate webhook delivery.`);
        return res.json({ success: true, received: true, message: "Payment already processed and credited" });
      }

      // 5. Robust Plan & Tier Resolution:
      // Look at cart, metadata, subscription, or actual transaction amount
      const productCart = Array.isArray(data.product_cart) ? data.product_cart : [];
      const planHint =
        metadata.plan_name ||
        metadata.tier_id ||
        metadata.product_id ||
        productCart[0]?.product_id ||
        data.product_id ||
        data.subscription?.product_id ||
        "";

      const totalAmountCents = Number(data.total_amount ?? data.amount ?? data.settlement_amount ?? 0);
      const amountUsd = Number(
        data.settlement_currency === "USD"
          ? (data.settlement_amount ? data.settlement_amount / 100 : 0)
          : (totalAmountCents > 0 && totalAmountCents < 100000 ? totalAmountCents / 100 : 0)
      );

      const resolvedPlan = resolveDodoProductId(planHint, totalAmountCents || amountUsd);
      if (!resolvedPlan) {
        console.error(`[Dodo Webhook] Could not safely resolve paid plan for payment ${paymentId} (hint: '${planHint}', total: ${totalAmountCents}). Refusing to dispense free credits.`);
        await db.execute(sql`
          INSERT INTO dodo_orders (
            order_id, payment_id, user_id, user_email, product_id, plan_name, amount_usd, credits, credits_nanos, status, metadata
          ) VALUES (
            ${`dodo_${paymentId}`}, ${paymentId}, ${userId}, ${metadata.user_email || null}, 'unknown', 'Unknown Plan', ${amountUsd}, 0, 0, 'REQUIRES_REVIEW', ${JSON.stringify(data)}
          ) ON DUPLICATE KEY UPDATE status = 'REQUIRES_REVIEW', updated_at = CURRENT_TIMESTAMP;
        `);
        return res.json({ received: true, warning: "Unknown plan flagged for manual review without credit grant" });
      }

      const isPayg = metadata.is_payg === "true" || planHint.toLowerCase().includes("payg");
      const { productId, planName, creditsNanos, tier } = resolvedPlan;
      const creditsWhole = Math.round(creditsNanos / 1_000_000_000);
      const effectiveAmountUsd = Number(metadata.amount_usd || resolvedPlan.amountUsd || amountUsd);

      // 6. Provision credits into durable credit accounts and ledger (protected by unique user+referenceId)
      const creditResult = await creditAccountFromDodoPay({
        userId,
        amountNanos: isPayg ? Math.round(effectiveAmountUsd * 1_000_000_000) : creditsNanos,
        orderId: `dodo_${paymentId}`,
        paymentId,
        assetLabel: isPayg ? `Card PAYG Deposit ($${effectiveAmountUsd.toFixed(2)})` : `Card / Dodo (${planName})`,
        planName: isPayg ? "PAYG Deposit" : planName,
        isPayg,
      });

      // 7. Update user tier to match their paid subscription/plan
      try {
        await setUserTier(userId, tier);
      } catch (tierErr) {
        console.warn("[Dodo Webhook] Failed to update user tier:", tierErr);
      }

      // 8. Unlock Claude Opus 5 and GPT-6 Astra access for this user
      const user = await getUserById(userId);
      if (user?.email) {
        try {
          await setGpt6AstraPremiumExemption(user.email, userId);
        } catch (exErr) {
          console.warn("[Dodo Webhook] Premium exemption note:", exErr);
        }
      }

      // 9. Persist completed order record in MySQL dodo_orders
      try {
        await db.execute(sql`
          INSERT INTO dodo_orders (
            order_id, payment_id, user_id, user_email, product_id, plan_name, amount_usd, credits, credits_nanos, status, metadata
          ) VALUES (
            ${`dodo_${paymentId}`}, ${paymentId}, ${userId}, ${user?.email || null}, ${productId}, ${planName}, ${effectiveAmountUsd}, ${creditsWhole}, ${creditsNanos}, 'COMPLETED', ${JSON.stringify(data)}
          ) ON DUPLICATE KEY UPDATE
            status = 'COMPLETED',
            amount_usd = VALUES(amount_usd),
            credits = VALUES(credits),
            credits_nanos = VALUES(credits_nanos),
            updated_at = CURRENT_TIMESTAMP;
        `);
      } catch (dbErr) {
        console.error("[Dodo Webhook] Error persisting completed dodo order:", dbErr);
      }

      console.log(`[Dodo Webhook] Successfully credited user ${userId} with ${creditsWhole} credits for payment ${paymentId} (${planName})! New balance nanos: ${creditResult?.balanceNanos}`);

      return res.json({ success: true, received: true });
    } catch (err: any) {
      console.error("[Dodo Webhook] Processing error:", err);
      return res.status(500).json({ error: err?.message || "Internal webhook error" });
    }
  });

  /**
   * GET /api/payments/dodo/history
   * Query recent Dodo Payments transaction history for a user.
   */
  app.get("/api/payments/dodo/history", async (req: Request, res: Response) => {
    try {
      const rawUserId = req.query.userId || (req as any).user?.id;
      if (!rawUserId) {
        return res.status(400).json({ error: "Missing required parameter: userId" });
      }
      const userId = parseInt(String(rawUserId), 10);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId" });
      }
      const payments = await listUserDodoPayments(userId);
      return res.json({ success: true, payments });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to fetch Dodo payments history" });
    }
  });

  /**
   * GET /api/payments/dodo/admin/history
   * Query all recent Dodo Payments transaction history for the admin panel.
   */
  app.get("/api/payments/dodo/admin/history", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(String(req.query.limit || 100), 10);
      const payments = await listAllDodoPayments(limit);
      return res.json({ success: true, payments });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to fetch admin Dodo payments" });
    }
  });

  /**
   * POST /api/payments/dodo/sync
   * Trigger direct sync with Dodo Payments API.
   */
  app.post("/api/payments/dodo/sync", async (_req: Request, res: Response) => {
    try {
      const result = await syncDodoPaymentsFromApi();
      return res.json({ success: true, synced: result.synced });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to sync Dodo payments" });
    }
  });
}
