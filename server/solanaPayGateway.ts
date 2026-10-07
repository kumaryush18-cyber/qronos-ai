import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { creditAccountFromSolanaPay, getDb } from "./db";
import { sql } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { createStrictCors } from "./_core/cors";
import { CRYPTO_TIERS, CODING_PLAN_TIERS, getCodingPlanTier } from "../shared/paymentTiers";

// ==============================================================================
// Production Configuration (Mainnet-Beta)
// ==============================================================================
export const SOLANA_MERCHANT_WALLET =
  process.env.SOLANA_MERCHANT_WALLET || "CUiXiA54MjUCxF1acboThD8R2CwLsqfDidiT7RWJsD7w";
export const HELIUS_API_KEY =
  process.env.HELIUS_API_KEY || "54742641-315e-4422-a192-48147ea0e19c";
export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
export const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";

// 10 minutes expiry (600 seconds) as required by specification
export const ORDER_EXPIRY_MINUTES = 10;
export const ORDER_EXPIRY_MS = ORDER_EXPIRY_MINUTES * 60 * 1000;

export interface SolanaPayOrder {
  orderId: string;
  userId: number | null;
  userEmail?: string | null;
  userName?: string | null;
  usdAmount: number;
  solAmount: number;
  solUsdPrice: number;
  currency: "SOL";
  creditsNanos: number;
  isPayg?: boolean;
  isCodingPlan?: boolean;
  codingTokens?: number;
  planName?: string;
  referencePubkey: string;
  merchantPubkey: string;
  solanaPayUrl: string;
  status: "PENDING" | "PAID" | "COMPLETED" | "EXPIRED" | "FAILED";
  createdAt: Date;
  expiresAt: Date;
  signature?: string;
  completedAt?: Date;
  errorMessage?: string;
}

// In-memory order store indexed by orderId and referencePubkey
const ordersById = new Map<string, SolanaPayOrder>();
const ordersByReference = new Map<string, SolanaPayOrder>();
const processedSignatures = new Set<string>();

/**
 * Synchronize Solana orders from database and ledger into memory
 */
export async function syncSolanaOrdersFromDb(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS solana_orders (
        order_id VARCHAR(64) PRIMARY KEY,
        user_id INT NULL,
        user_email VARCHAR(320) NULL,
        user_name VARCHAR(255) NULL,
        usd_amount DECIMAL(10, 2) NOT NULL,
        sol_amount DECIMAL(12, 6) NOT NULL,
        credits_nanos BIGINT NOT NULL,
        reference_pubkey VARCHAR(64) NULL,
        merchant_pubkey VARCHAR(64) NULL,
        status VARCHAR(32) NOT NULL,
        signature VARCHAR(128) NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        completed_at DATETIME NULL
      )
    `);

    // Hydrate any from credit_ledger
    try {
      const ledgerRows = await db.execute(sql`
        SELECT cl.id, cl.userId, u.email as userEmail, u.name as userName, cl.amountNanos, cl.referenceId, cl.note, cl.createdAt
        FROM credit_ledger cl
        LEFT JOIN users u ON cl.userId = u.id
        WHERE cl.referenceId LIKE "solana_pay:%"
        ORDER BY cl.createdAt DESC
      `);

      if (ledgerRows && Array.isArray(ledgerRows[0])) {
        for (const r of ledgerRows[0] as any[]) {
          const orderId = String(r.referenceId || "").replace("solana_pay:", "").trim();
          const solMatch = (r.note || "").match(/([\d.]+)\s*SOL/i);
          const solAmount = solMatch ? parseFloat(solMatch[1]) : 0.1;
          const sigMatch = (r.note || "").match(/tx:\s*([A-Za-z0-9]+)/);
          const signature = sigMatch ? sigMatch[1] : null;
          const creditsNanos = Number(r.amountNanos);
          const usdAmount = Math.round((creditsNanos / 1_000_000_000) * 100) / 100;
          const createdAt = r.createdAt ? new Date(r.createdAt) : new Date();

          await db.execute(sql`
            INSERT INTO solana_orders (
              order_id, user_id, user_email, user_name, usd_amount, sol_amount,
              credits_nanos, reference_pubkey, merchant_pubkey, status, signature,
              created_at, expires_at, completed_at
            ) VALUES (
              ${orderId}, ${r.userId}, ${r.userEmail}, ${r.userName}, ${usdAmount}, ${solAmount},
              ${creditsNanos}, "REF_AUTO_HYDRATE", "MERCHANT_AUTO", "PAID", ${signature},
              ${createdAt}, ${createdAt}, ${createdAt}
            )
            ON DUPLICATE KEY UPDATE
              user_email = VALUES(user_email),
              user_name = VALUES(user_name),
              status = "PAID",
              signature = VALUES(signature),
              completed_at = VALUES(completed_at)
          `);
        }
      }
    } catch (e) {
      console.warn("[Solana Pay] Hydration warning:", e);
    }

    // Populate in-memory map
    const rows = await db.execute(sql`
      SELECT 
        so.*,
        COALESCE(so.user_email, u.email) as resolved_user_email,
        COALESCE(so.user_name, u.name) as resolved_user_name
      FROM solana_orders so
      LEFT JOIN users u ON so.user_id = u.id
      ORDER BY so.created_at DESC
    `);

    if (rows && Array.isArray(rows[0])) {
      for (const r of rows[0] as any[]) {
        const order: SolanaPayOrder = {
          orderId: r.order_id,
          userId: r.user_id,
          userEmail: r.resolved_user_email || r.user_email || null,
          userName: r.resolved_user_name || r.user_name || null,
          usdAmount: Number(r.usd_amount),
          solAmount: Number(r.sol_amount),
          solUsdPrice: 150.0,
          currency: "SOL",
          creditsNanos: Number(r.credits_nanos),
          referencePubkey: r.reference_pubkey || "",
          merchantPubkey: r.merchant_pubkey || SOLANA_MERCHANT_WALLET,
          solanaPayUrl: "",
          status: r.status,
          createdAt: new Date(r.created_at),
          expiresAt: new Date(r.expires_at),
          signature: r.signature || undefined,
          completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
        };
        ordersById.set(order.orderId, order);
        if (order.referencePubkey) ordersByReference.set(order.referencePubkey, order);
        if (order.signature) processedSignatures.add(order.signature);
      }
    }
  } catch (err) {
    console.error("[Solana Pay] Error syncing solana orders:", err);
  }
}

// Cache for Binance price to avoid aggressive rate-limits
let cachedSolPrice = { price: 105.0, updatedAt: 0 };

/**
 * Queries Binance's public ticker for live SOL/USDT spot price.
 * Caches result for 5 seconds for fast subsequent queries.
 */
export async function getSolPriceUsd(): Promise<number> {
  const now = Date.now();
  if (now - cachedSolPrice.updatedAt < 5000 && cachedSolPrice.price > 0) {
    return cachedSolPrice.price;
  }

  const url = "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "TokenForge-SolanaPay/2.0" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const parsed = parseFloat(data.price);
      if (Number.isFinite(parsed) && parsed > 0) {
        cachedSolPrice = { price: parsed, updatedAt: now };
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[Solana Pay] Binance price fetch warning:", err);
  }

  // Fallback to CoinGecko if Binance is rate-limited
  try {
    const cgRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { headers: { Accept: "application/json" } }
    );
    if (cgRes.ok) {
      const cgData = await cgRes.json();
      const cgPrice = cgData?.solana?.usd;
      if (Number.isFinite(cgPrice) && cgPrice > 0) {
        cachedSolPrice = { price: cgPrice, updatedAt: now };
        return cgPrice;
      }
    }
  } catch {
    // ignore
  }

  return cachedSolPrice.price > 0 ? cachedSolPrice.price : 105.0;
}

/**
 * Converts USD packages to SOL dynamically:
 * amount_sol = round(package_usd / sol_usd_price, 5)
 */
export function calculateSolAmount(packageUsd: number, solUsdPrice: number): number {
  if (!solUsdPrice || solUsdPrice <= 0) solUsdPrice = 105.0;
  return Math.round((packageUsd / solUsdPrice) * 100000) / 100000;
}

/**
 * Generates the standard Solana Pay URL:
 * solana:CUiXiA54MjUCxF1acboThD8R2CwLsqfDidiT7RWJsD7w?amount=<AMOUNT_SOL>&reference=<REFERENCE_PUBKEY>&label=TokenForge&message=API+Credits
 */
export function buildSolanaPayUrl(params: {
  merchantPubkey: string;
  amountSol: number;
  referencePubkey: string;
  label?: string;
  message?: string;
}): string {
  const url = new URL(`solana:${params.merchantPubkey}`);
  // Format with up to 5 decimals without trailing zeros
  const amountStr = params.amountSol.toFixed(5).replace(/\.?0+$/, "");
  url.searchParams.set("amount", amountStr);
  url.searchParams.set("reference", params.referencePubkey);
  url.searchParams.set("label", params.label || "TokenForge");
  url.searchParams.set("message", params.message || "API Credits");

  return url.toString();
}

/**
 * Clean up expired pending orders periodically.
 */
function cleanupStaleOrders() {
  const now = Date.now();
  for (const [, order] of ordersById.entries()) {
    if (order.status === "PENDING" && now > order.expiresAt.getTime()) {
      order.status = "EXPIRED";
    }
  }
}
setInterval(cleanupStaleOrders, 30_000).unref();

export function registerSolanaPayGateway(app: Express) {
  // Synchronize orders from persistent DB storage
  syncSolanaOrdersFromDb().catch((err) => {
    console.warn("[Solana Pay] Initial sync error:", err);
  });

  // Strict CORS policy: blocks arbitrary cross-origin domains and "null" origins
  const solanaPayCors = createStrictCors({ allowCredentials: true });

  app.use("/api/solana-pay", solanaPayCors);
  app.use("/api/payments/solana", solanaPayCors);

  /**
   * GET /api/solana-pay/config
   * Production Mainnet-Beta configuration.
   */
  app.get("/api/solana-pay/config", (_req: Request, res: Response) => {
    return res.json({
      merchant_pubkey: SOLANA_MERCHANT_WALLET,
      solana_rpc_url: SOLANA_RPC_URL,
      network: SOLANA_NETWORK,
      accepted_assets: ["SOL"],
      expiry_minutes: ORDER_EXPIRY_MINUTES,
      expiry_seconds: ORDER_EXPIRY_MS / 1000,
    });
  });

  /**
   * GET /api/solana-pay/price
   * Real-time Binance SOLUSDT price and precalculated packages.
   */
  app.get("/api/solana-pay/price", async (_req: Request, res: Response) => {
    try {
      const price = await getSolPriceUsd();
      const packages = [
        { usd: 10, sol: calculateSolAmount(10, price), label: "Starter" },
        { usd: 25, sol: calculateSolAmount(25, price), label: "Pro", popular: true },
        { usd: 50, sol: calculateSolAmount(50, price), label: "Max" },
        { usd: 100, sol: calculateSolAmount(100, price), label: "Power" },
        { usd: 200, sol: calculateSolAmount(200, price), label: "Ultra" },
      ];
      return res.json({
        symbol: "SOLUSDT",
        sol_usd_price: price,
        source: "Binance Public Ticker",
        timestamp: new Date().toISOString(),
        packages,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch price", details: err?.message });
    }
  });

  /**
   * POST /api/solana-pay/create-order
   * 1. Requires user authentication (prevents user ID spoofing).
   * 2. Fetches live SOL price from Binance via getSolPriceUsd().
   * 3. Validates USD packages and converts to SOL dynamically.
   * 4. Generates a unique, single-use Solana Keypair to act as the reference key.
   * 5. Sets expires_at = Date.now() + 10 minutes.
   * 6. Stores order with status PENDING and high-entropy order ID.
   * 7. Constructs and returns the standard Solana Pay URL.
   */
  app.post(["/api/solana-pay/create-order", "/api/payments/solana/create-order"], async (req: Request, res: Response) => {
    try {
      // 1. Enforce Authentication (Prevents unauthenticated order creation and user ID spoofing)
      const authUser = await sdk.authenticateRequest(req).catch(() => null);
      if (!authUser) {
        return res.status(401).json({
          error: "Authentication required",
          detail: "You must be logged in to create a Solana Pay order.",
        });
      }

      const {
        usd_amount,
        package_usd,
        amount_sol,
        tier_id,
        tierId,
        label = "TokenForge",
        message = "API Credits",
        is_payg,
        isPayg,
        is_coding_plan,
        isCodingPlan,
      } = req.body || {};

      const isPaygDeposit = Boolean(is_payg || isPayg);
      const isCoding = Boolean(is_coding_plan || isCodingPlan || (tier_id && String(tier_id).startsWith("coding_")) || (tierId && String(tierId).startsWith("coding_")));
      const solUsdPrice = await getSolPriceUsd();

      const matchedCodingTier = isCoding ? getCodingPlanTier(tier_id || tierId || package_usd || usd_amount || 25) : undefined;

      // Determine USD value: accept usd_amount, package_usd, or convert from amount_sol
      let targetUsd = matchedCodingTier ? matchedCodingTier.amountUsd : Number(usd_amount || package_usd || 25);
      let targetSol: number;

      if (Number.isFinite(Number(amount_sol)) && Number(amount_sol) > 0 && !matchedCodingTier) {
        targetSol = Math.round(Number(amount_sol) * 100000) / 100000;
        targetUsd = Math.round(targetSol * solUsdPrice * 100) / 100;
      } else {
        if (!Number.isFinite(targetUsd) || targetUsd <= 0) targetUsd = 25;
        targetSol = calculateSolAmount(targetUsd, solUsdPrice);
      }

      // Bound checks
      if (!Number.isFinite(targetUsd) || targetUsd <= 0 || targetUsd > 100_000) {
        return res.status(400).json({ error: "Invalid order amount." });
      }

      // 1. Generate unique single-use ed25519 Keypair as reference public key
      const referenceKeypair = Keypair.generate();
      const referencePubkey = referenceKeypair.publicKey.toBase58();

      // Cryptographically secure 128-bit high-entropy random order ID
      const orderId = `tf_sol_${randomBytes(16).toString("hex")}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ORDER_EXPIRY_MS);
      // Compute credit amount based on CRYPTO_TIERS or 240 credits/USD rate or CODING_PLAN_TIERS
      const matchedTier = matchedCodingTier ? undefined : CRYPTO_TIERS.find((t) => t.usd === targetUsd);
      const creditsNanos =
        matchedCodingTier?.tokens ??
        matchedTier?.creditsNanos ?? Math.trunc(targetUsd * 240 * 1_000_000_000);
      const credits = Math.trunc(creditsNanos / 1_000_000_000);

      // 2. Construct standard Solana Pay URL
      const solanaPayUrl = buildSolanaPayUrl({
        merchantPubkey: SOLANA_MERCHANT_WALLET,
        amountSol: targetSol,
        referencePubkey,
        label: matchedCodingTier ? `TokenForge Coding Plan` : label,
        message: matchedCodingTier ? `${matchedCodingTier.tokensMillions}M Coding Tokens ($${matchedCodingTier.amountUsd})` : message,
      });

      const parsedUserId = authUser.id;
      const resolvedUserEmail: string | null = authUser.email ?? null;
      const resolvedUserName: string | null = authUser.name ?? null;

      const order: SolanaPayOrder = {
        orderId,
        userId: parsedUserId,
        userEmail: resolvedUserEmail,
        userName: resolvedUserName,
        usdAmount: targetUsd,
        solAmount: targetSol,
        solUsdPrice,
        currency: "SOL",
        creditsNanos,
        isPayg: isPaygDeposit,
        isCodingPlan: Boolean(matchedCodingTier || isCoding),
        codingTokens: matchedCodingTier?.tokens,
        planName: matchedCodingTier?.name,
        referencePubkey,
        merchantPubkey: SOLANA_MERCHANT_WALLET,
        solanaPayUrl,
        status: "PENDING",
        createdAt: now,
        expiresAt,
      };

      ordersById.set(orderId, order);
      ordersByReference.set(referencePubkey, order);

      // Persist pending order to database
      try {
        const db = await getDb();
        if (db) {
          await db.execute(sql`
            INSERT INTO solana_orders (
              order_id, user_id, user_email, user_name, usd_amount, sol_amount,
              credits_nanos, reference_pubkey, merchant_pubkey, status, signature,
              created_at, expires_at, completed_at
            ) VALUES (
              ${order.orderId}, ${order.userId}, ${order.userEmail || null}, ${order.userName || null},
              ${order.usdAmount}, ${order.solAmount}, ${order.creditsNanos},
              ${order.referencePubkey}, ${order.merchantPubkey}, "PENDING", NULL,
              ${order.createdAt}, ${order.expiresAt}, NULL
            )
            ON DUPLICATE KEY UPDATE
              user_email = COALESCE(VALUES(user_email), user_email),
              user_name = COALESCE(VALUES(user_name), user_name)
          `);
        }
      } catch (err) {
        console.warn("[Solana Pay] Failed to persist initial order record:", err);
      }

      return res.status(201).json({
        order_id: order.orderId,
        user_id: order.userId,
        user_email: order.userEmail,
        user_name: order.userName,
        usd_amount: order.usdAmount,
        sol_amount: order.solAmount,
        amount_sol: order.solAmount, // compatibility alias
        sol_usd_price: order.solUsdPrice,
        currency: order.currency,
        credits,
        credits_nanos: order.creditsNanos,
        reference_pubkey: order.referencePubkey,
        merchant_pubkey: order.merchantPubkey,
        solana_pay_url: order.solanaPayUrl,
        status: order.status,
        created_at: order.createdAt.toISOString(),
        expires_at: order.expiresAt.toISOString(),
        expires_in_seconds: Math.round((expiresAt.getTime() - now.getTime()) / 1000),
      });
    } catch (error: any) {
      console.error("[Solana Pay] Error creating order:", error);
      return res.status(500).json({
        error: "Failed to create Solana Pay order",
        details: error?.message || String(error),
      });
    }
  });

  /**
   * POST /api/solana-pay/verify-order
   * 1. Check if the order has expired (current_time > expires_at). If expired,
   *    return an EXPIRED status so the frontend can prompt user to refresh the quote.
   * 2. Query Helius Mainnet RPC using getSignaturesForAddress on the reference key.
   * 3. If a confirmed or finalized transaction signature is found:
   *    - Verify recipient is CUiXiA54MjUCxF1acboThD8R2CwLsqfDidiT7RWJsD7w.
   *    - Verify transferred SOL matches sol_amount.
   *    - Mark order as PAID and immediately increment user's API credit balance.
   */
  const handleVerifyOrder = async (req: Request, res: Response) => {
    try {
      const orderIdParam = req.params.orderId || (req.params as any).order_id;
      const { order_id, reference_pubkey } = req.body || {};
      const resolvedOrderId = order_id || orderIdParam;

      let order: SolanaPayOrder | undefined;
      if (resolvedOrderId) {
        order = ordersById.get(String(resolvedOrderId));
      } else if (reference_pubkey) {
        order = ordersByReference.get(String(reference_pubkey));
      }

      if (!order) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      // Authorization check: If authenticated, ensure requester owns the order or is an administrator
      const authUser = await sdk.authenticateRequest(req).catch(() => null);
      if (authUser && order.userId && order.userId !== authUser.id) {
        const isAdmin =
          (authUser as any).isAdminSession ||
          authUser.role === "admin" ||
          (authUser as any).isSuperAdmin;
        if (!isAdmin) {
          return res.status(403).json({ error: "Unauthorized" });
        }
      }

      // Idempotency check: if already completed/paid, return success immediately
      if (order.status === "PAID" || order.status === "COMPLETED") {
        return res.json({
          success: true,
          status: "PAID",
          already_verified: true,
          signature: order.signature,
          order_id: order.orderId,
          usd_amount: order.usdAmount,
          sol_amount: order.solAmount,
          amount_sol: order.solAmount,
          credits_nanos: order.creditsNanos,
          explorer_url: `https://explorer.solana.com/tx/${order.signature}`,
          completed_at: order.completedAt?.toISOString(),
        });
      }

      // 1. Check 5-minute expiration
      const now = Date.now();
      if (now > order.expiresAt.getTime()) {
        order.status = "EXPIRED";
        return res.json({
          success: false,
          status: "EXPIRED",
          order_id: order.orderId,
          error: "Price quote expired",
          message: "Payment window expired (5-minute quote timeout). Please refresh the price to regenerate an active reference key.",
        });
      }

      // 2. Query Helius Mainnet RPC for signatures referencing the payment public key
      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      let signatures;
      try {
        signatures = await connection.getSignaturesForAddress(
          new PublicKey(order.referencePubkey),
          { limit: 5 },
          "confirmed"
        );
      } catch (rpcErr: any) {
        console.error("[Solana Pay] RPC getSignaturesForAddress error:", rpcErr);
        return res.status(503).json({
          error: "Solana RPC node communication failure",
          details: rpcErr?.message || String(rpcErr),
        });
      }

      if (!signatures || signatures.length === 0) {
        return res.json({
          success: false,
          status: "PENDING",
          order_id: order.orderId,
          reference_pubkey: order.referencePubkey,
          seconds_remaining: Math.max(0, Math.round((order.expiresAt.getTime() - now) / 1000)),
          message: "Transaction not yet detected on-chain. Listening on Helius RPC...",
        });
      }

      // Grab the latest transaction signature referencing this payment
      const targetSigInfo = signatures[0];

      if (targetSigInfo.err) {
        order.status = "FAILED";
        order.signature = targetSigInfo.signature;
        order.errorMessage = JSON.stringify(targetSigInfo.err);
        return res.status(400).json({
          success: false,
          status: "FAILED",
          error: "Transaction was submitted on-chain but failed execution.",
          signature: targetSigInfo.signature,
        });
      }

      // Double-spending prevention
      if (processedSignatures.has(targetSigInfo.signature)) {
        for (const other of ordersById.values()) {
          if (
            other.orderId !== order.orderId &&
            other.signature === targetSigInfo.signature &&
            (other.status === "PAID" || other.status === "COMPLETED")
          ) {
            return res.status(409).json({
              error: "Double-spending detected: Transaction signature was already settled for another order.",
              signature: targetSigInfo.signature,
            });
          }
        }
      }

      // Query full parsed transaction details from Helius Mainnet to verify recipient and amount
      const tx = await connection.getParsedTransaction(targetSigInfo.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (!tx || !tx.meta) {
        return res.json({
          success: false,
          status: "PENDING",
          order_id: order.orderId,
          signature: targetSigInfo.signature,
          message: "Transaction detected on Solana Mainnet, awaiting final indexing...",
        });
      }

      // Validate that merchant address received the expected payment
      let amountVerified = false;
      const expectedLamports = Math.round(order.solAmount * LAMPORTS_PER_SOL);
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === "string" ? k : k.pubkey.toBase58()
      );
      const merchantIndex = accountKeys.indexOf(order.merchantPubkey);

      if (merchantIndex >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
        const preBal = tx.meta.preBalances[merchantIndex] ?? 0;
        const postBal = tx.meta.postBalances[merchantIndex] ?? 0;
        const receivedLamports = postBal - preBal;

        // Check received lamports match expected (allowing 0.5% tolerance margin)
        if (receivedLamports >= expectedLamports * 0.995) {
          amountVerified = true;
        }
      }

      // Also check parsed instruction transfers as fallback verification
      if (!amountVerified && tx.transaction.message.instructions) {
        for (const ix of tx.transaction.message.instructions) {
          if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer") {
            const info = ix.parsed.info;
            if (
              info?.destination === order.merchantPubkey &&
              Number(info?.lamports) >= expectedLamports * 0.995
            ) {
              amountVerified = true;
              break;
            }
          }
        }
      }

      if (!amountVerified) {
        return res.status(400).json({
          success: false,
          status: "FAILED",
          error: `Transaction did not transfer the expected ${order.solAmount} SOL to merchant address ${order.merchantPubkey}.`,
          signature: targetSigInfo.signature,
          merchant_pubkey: order.merchantPubkey,
        });
      }

      // Mark order PAID and record signature
      order.status = "PAID";
      order.signature = targetSigInfo.signature;
      order.completedAt = new Date();
      processedSignatures.add(targetSigInfo.signature);

      // Immediately increment user credit balance if userId is present
      let updatedBalanceNanos: number | null = null;
      let updatedCodingTokens: number | null = null;
      if (order.userId) {
        try {
          const creditResult = await creditAccountFromSolanaPay({
            userId: order.userId,
            amountNanos: order.isPayg ? Math.round(order.usdAmount * 1_000_000_000) : (order.isCodingPlan ? (order.codingTokens || order.creditsNanos) : order.creditsNanos),
            orderId: order.orderId,
            signature: targetSigInfo.signature,
            assetLabel: order.isCodingPlan ? `Coding Plan: ${order.planName || "Coding Plan"} (${Math.round((order.codingTokens || 0) / 1_000_000)}M Tokens)` : order.isPayg ? `Solana Pay PAYG Deposit ($${order.usdAmount.toFixed(2)})` : `${order.solAmount} SOL ($${order.usdAmount.toFixed(2)} - ${Math.trunc(order.creditsNanos / 1_000_000_000).toLocaleString()} credits)`,
            isPayg: order.isPayg,
            isCodingPlan: order.isCodingPlan,
            codingPlanTokens: order.codingTokens,
            planName: order.planName,
          });
          updatedBalanceNanos = creditResult?.balanceNanos ?? null;
          updatedCodingTokens = creditResult?.codingPlanTokens ?? null;
        } catch (dbError) {
          console.error(
            `[Solana Pay] Failed to update credit account for user ${order.userId}:`,
            dbError
          );
        }
      }

      // Update persistent database record
      try {
        const db = await getDb();
        if (db) {
          await db.execute(sql`
            UPDATE solana_orders
            SET status = "PAID", signature = ${targetSigInfo.signature}, completed_at = NOW()
            WHERE order_id = ${order.orderId}
          `);
        }
      } catch (dbErr) {
        console.warn("[Solana Pay] Failed to update order status in DB:", dbErr);
      }

      return res.json({
        success: true,
        status: "PAID",
        order_id: order.orderId,
        user_id: order.userId,
        user_email: order.userEmail,
        user_name: order.userName,
        usd_amount: order.usdAmount,
        sol_amount: order.solAmount,
        amount_sol: order.solAmount,
        currency: order.currency,
        credits: Math.trunc(order.creditsNanos / 1_000_000_000),
        credits_nanos: order.creditsNanos,
        is_coding_plan: Boolean(order.isCodingPlan),
        coding_tokens: order.codingTokens,
        updated_balance_nanos: updatedBalanceNanos,
        updated_coding_tokens: updatedCodingTokens,
        signature: targetSigInfo.signature,
        explorer_url: `https://explorer.solana.com/tx/${targetSigInfo.signature}`,
        completed_at: order.completedAt.toISOString(),
        message: order.isCodingPlan
          ? `Payment successfully verified on Solana Mainnet-Beta. ${Math.round((order.codingTokens || 0) / 1_000_000)}M Coding Tokens added to account.`
          : "Payment successfully verified on Solana Mainnet-Beta. Account credited.",
      });
    } catch (error: any) {
      console.error("[Solana Pay] Error verifying order:", error);
      return res.status(500).json({
        error: "Failed to verify Solana Pay transaction",
        details: error?.message || String(error),
      });
    }
  };

  app.post("/api/solana-pay/verify-order", handleVerifyOrder);
  app.post("/api/payments/solana/verify/:orderId?", handleVerifyOrder);
  app.get("/api/payments/solana/verify/:orderId", handleVerifyOrder);

  /**
   * GET /api/solana-pay/order-status/:orderId
   * Hardened against IDOR: Requires authentication and verifies caller ownership or administrator role.
   */
  const handleOrderStatus = async (req: Request, res: Response) => {
    const orderId = req.params.orderId || (req.params as any).order_id;
    const order = ordersById.get(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // IDOR Protection: Verify caller is authenticated and owns this order (or is admin)
    const authUser = await sdk.authenticateRequest(req).catch(() => null);
    const isOwner = authUser && order.userId && order.userId === authUser.id;
    const isAdmin =
      authUser &&
      ((authUser as any).isAdminSession ||
        authUser.role === "admin" ||
        (authUser as any).isSuperAdmin);

    if (!isOwner && !isAdmin) {
      return res.status(404).json({ error: "Order not found" });
    }

    const now = Date.now();
    const isPastExpiry = now > order.expiresAt.getTime();
    if (order.status === "PENDING" && isPastExpiry) {
      order.status = "EXPIRED";
    }

    return res.json({
      order_id: order.orderId,
      usd_amount: order.usdAmount,
      sol_amount: order.solAmount,
      amount_sol: order.solAmount,
      sol_usd_price: order.solUsdPrice,
      currency: order.currency,
      credits: Math.trunc(order.creditsNanos / 1_000_000_000),
      credits_nanos: order.creditsNanos,
      reference_pubkey: order.referencePubkey,
      merchant_pubkey: order.merchantPubkey,
      solana_pay_url: order.solanaPayUrl,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      expires_at: order.expiresAt.toISOString(),
      signature: order.signature,
      completed_at: order.completedAt?.toISOString(),
      seconds_remaining: Math.max(0, Math.round((order.expiresAt.getTime() - now) / 1000)),
    });
  };

  app.get("/api/solana-pay/order-status/:orderId", handleOrderStatus);
  app.get("/api/payments/solana/status/:orderId", handleOrderStatus);

  /**
   * GET /api/solana-pay/paid-users
   * Returns complete history of users who paid with Solana, including their email ID, amount, timestamp, etc.
   */
  const handleGetPaidUsers = async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      const userId = (req as any).session?.userId;
      const userRole = (req as any).session?.role;
      const isAdminRoute = req.path.includes('/api/admin/');

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const isAdminRequest = isAdminRoute && userRole === 'admin';

      let query;
      if (isAdminRequest) {
        query = sql`
          SELECT 
            so.order_id as orderId,
            so.user_id as userId,
            COALESCE(so.user_email, u.email) as userEmail,
            COALESCE(so.user_name, u.name) as userName,
            so.sol_amount as solAmount,
            so.usd_amount as usdAmount,
            so.credits_nanos as creditsNanos,
            so.signature,
            so.created_at as createdAt,
            so.completed_at as completedAt,
            so.status
          FROM solana_orders so
          LEFT JOIN users u ON so.user_id = u.id
          WHERE so.status IN ("PAID", "COMPLETED")
          ORDER BY so.completed_at DESC, so.created_at DESC
        `;
      } else {
        query = sql`
          SELECT 
            so.order_id as orderId,
            so.user_id as userId,
            COALESCE(so.user_email, u.email) as userEmail,
            COALESCE(so.user_name, u.name) as userName,
            so.sol_amount as solAmount,
            so.usd_amount as usdAmount,
            so.credits_nanos as creditsNanos,
            so.signature,
            so.created_at as createdAt,
            so.completed_at as completedAt,
            so.status
          FROM solana_orders so
          LEFT JOIN users u ON so.user_id = u.id
          WHERE so.status IN ("PAID", "COMPLETED") AND so.user_id = ${userId}
          ORDER BY so.completed_at DESC, so.created_at DESC
        `;
      }
      
      const rows = await db.execute(query);

      const rawList = (rows && Array.isArray(rows[0])) ? (rows[0] as any[]) : [];
      let totalVolumeSol = 0;
      let totalVolumeUsd = 0;
      let totalCredits = 0;
      const uniqueUserSet = new Set<string>();

      const payments = rawList.map((r) => {
        const sol = Number(r.solAmount) || 0;
        const usd = Number(r.usdAmount) || 0;
        const credNanos = Number(r.creditsNanos) || 0;
        const creds = Math.floor(credNanos / 1_000_000_000);

        totalVolumeSol += sol;
        totalVolumeUsd += usd;
        totalCredits += creds;
        if (r.userEmail) uniqueUserSet.add(r.userEmail);
        else if (r.userId) uniqueUserSet.add(String(r.userId));

        return {
          orderId: r.orderId,
          userId: r.userId,
          userEmail: r.userEmail || null,
          userName: r.userName || null,
          solAmount: sol,
          solFormatted: `${sol.toFixed(4)} SOL`,
          usdAmount: usd,
          usdFormatted: `$${usd.toFixed(2)}`,
          credits: creds,
          creditsFormatted: `+${creds.toLocaleString()} credits`,
          signature: r.signature || null,
          explorerUrl: r.signature ? `https://explorer.solana.com/tx/${r.signature}` : null,
          timestamp: r.completedAt ? new Date(r.completedAt).toISOString() : new Date(r.createdAt).toISOString(),
          status: "CONFIRMED",
        };
      });

      return res.json({
        success: true,
        total_paid_users: uniqueUserSet.size,
        total_transactions: payments.length,
        total_volume_sol: parseFloat(totalVolumeSol.toFixed(4)),
        total_volume_usd: parseFloat(totalVolumeUsd.toFixed(2)),
        total_credits: totalCredits,
        payments,
      });
    } catch (err: any) {
      console.error("[Solana Pay] Error fetching paid users:", err);
      return res.status(500).json({ error: "Failed to load paid users", details: err?.message });
    }
  };

  app.get("/api/solana-pay/paid-users", handleGetPaidUsers);
  app.get("/api/admin/solana/paid-users", handleGetPaidUsers);
  app.get("/api/payments/solana/paid-users", handleGetPaidUsers);

  /**
   * GET /api/solana-pay/transactions
   * Fetches recent Solana payment transactions for merchant wallet on Mainnet-Beta using Helius API.
   */
  const handleGetTransactions = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${SOLANA_MERCHANT_WALLET}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`;

      let rawTransactions: any[] = [];
      let providerSource = "helius-enhanced-mainnet";

      try {
        const response = await fetch(heliusUrl, {
          headers: { "Content-Type": "application/json" },
        });

        if (response.ok) {
          rawTransactions = await response.json();
        } else {
          console.warn(`[Solana Pay] Helius enhanced API returned ${response.status}. Falling back to RPC.`);
          providerSource = "helius-rpc-mainnet";
        }
      } catch (heliusErr) {
        console.warn("[Solana Pay] Helius enhanced API request failed:", heliusErr);
        providerSource = "helius-rpc-mainnet";
      }

      // If enhanced API returned empty or failed, fallback to standard RPC getSignaturesForAddress
      if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
        try {
          const rpcRes = await fetch(SOLANA_RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getSignaturesForAddress",
              params: [SOLANA_MERCHANT_WALLET, { limit }],
            }),
          });
          const rpcJson = await rpcRes.json();
          const sigs = rpcJson?.result || [];

          rawTransactions = sigs.map((sigItem: any) => ({
            signature: sigItem.signature,
            slot: sigItem.slot,
            timestamp: sigItem.blockTime,
            type: "TRANSFER",
            description: `Payment transaction referencing merchant wallet`,
            source: "SOLANA_MAINNET",
            fee: 5000,
            feePayer: sigItem.signature,
            nativeTransfers: [],
            transactionError: sigItem.err,
            memo: sigItem.memo,
          }));
        } catch (rpcErr) {
          console.error("[Solana Pay] RPC fallback also failed:", rpcErr);
        }
      }

      // Format parsed transactions for client consumption
      let totalVolumeSol = 0;
      const formattedTransactions = (rawTransactions || []).map((tx: any) => {
        const signature = tx.signature || "";
        const timestampSeconds = tx.timestamp || tx.blockTime || Math.floor(Date.now() / 1000);
        const timestampMs = timestampSeconds * 1000;
        const dateIso = new Date(timestampMs).toISOString();

        // Calculate SOL transferred to merchant wallet
        let receivedLamports = 0;
        let senderAddress = tx.feePayer || "Unknown Sender";

        if (Array.isArray(tx.nativeTransfers)) {
          for (const transfer of tx.nativeTransfers) {
            if (transfer.toUserAccount === SOLANA_MERCHANT_WALLET) {
              receivedLamports += Number(transfer.amount) || 0;
              if (transfer.fromUserAccount && transfer.fromUserAccount !== SOLANA_MERCHANT_WALLET) {
                senderAddress = transfer.fromUserAccount;
              }
            }
          }
        }

        if (receivedLamports === 0 && Array.isArray(tx.accountData)) {
          const merchantData = tx.accountData.find((a: any) => a.account === SOLANA_MERCHANT_WALLET);
          if (merchantData && merchantData.nativeBalanceChange > 0) {
            receivedLamports = merchantData.nativeBalanceChange;
          }
        }

        if (receivedLamports === 0 && typeof tx.description === "string") {
          const match = tx.description.match(/transferred\s+([\d.]+)\s+SOL/i);
          if (match && match[1]) {
            receivedLamports = Math.round(parseFloat(match[1]) * LAMPORTS_PER_SOL);
          }
        }

        const amountSol = receivedLamports > 0 ? receivedLamports / LAMPORTS_PER_SOL : 0.05;
        const isSuccess = !tx.transactionError && !tx.err;

        if (isSuccess) {
          totalVolumeSol += amountSol;
        }

        // 1 USD = 1_000_000_000 nanos
        const estimatedUsd = amountSol * (cachedSolPrice.price || 105.0);
        const creditsNanos = Math.trunc(estimatedUsd * 1_000_000_000);
        const creditsUsd = estimatedUsd.toFixed(2);

        let matchedOrder: any = null;
        for (const order of ordersById.values()) {
          if (
            order.signature &&
            (order.signature === signature ||
              signature.startsWith(order.signature) ||
              order.signature.startsWith(signature))
          ) {
            matchedOrder = {
              orderId: order.orderId,
              userId: order.userId,
              userEmail: order.userEmail || null,
              userName: order.userName || null,
              status: order.status,
            };
            break;
          }
        }

        return {
          signature,
          slot: tx.slot,
          timestamp: timestampMs,
          date: dateIso,
          status: isSuccess ? "CONFIRMED" : "FAILED",
          type: tx.type || "TRANSFER",
          source: tx.source || "SOLANA_MAINNET",
          amountSol,
          amountFormatted: `${amountSol.toFixed(4)} SOL`,
          creditsNanos,
          creditsFormatted: `+$${creditsUsd}`,
          from: senderAddress,
          to: SOLANA_MERCHANT_WALLET,
          feeLamports: tx.fee || 5000,
          feeSol: (tx.fee || 5000) / LAMPORTS_PER_SOL,
          description: tx.description || `Transferred ${amountSol} SOL to merchant`,
          explorerUrl: `https://explorer.solana.com/tx/${signature}`,
          userEmail: matchedOrder?.userEmail || null,
          userName: matchedOrder?.userName || null,
          matchedOrder,
        };
      });

      return res.json({
        success: true,
        network: SOLANA_NETWORK,
        provider_source: providerSource,
        merchant_wallet: SOLANA_MERCHANT_WALLET,
        total_transactions: formattedTransactions.length,
        total_volume_sol: parseFloat(totalVolumeSol.toFixed(4)),
        transactions: formattedTransactions,
      });
    } catch (err: any) {
      console.error("[Solana Pay] Error fetching transactions:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch Solana payment transactions",
        details: err?.message || String(err),
      });
    }
  };

  app.get("/api/solana-pay/transactions", handleGetTransactions);
  app.get("/api/payments/solana/transactions", handleGetTransactions);
}
