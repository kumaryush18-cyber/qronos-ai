import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "../googleOAuth";
import { registerGitHubOAuthRoutes } from "../githubOAuth";
import { registerDiscordOAuthRoutes } from "../discordOAuth";
import { registerStorageProxy } from "./storageProxy";
import { registerOpenAiGateway, registerPlaygroundGateway } from "../openaiGateway";
import { registerLiveRequestRoutes } from "./liveRequests";
import { registerAnthropicMessagesGateway } from "../anthropicGateway";
import { registerManagedFailureLogRetention } from "../managedFailureLogRetention";
import { registerSolanaPayGateway } from "../solanaPayGateway";
import { registerUpiPayGateway } from "../upiPayGateway";
import { registerCashfreeGateway } from "../cashfreeGateway";
import { registerDodoPaymentsGateway } from "../dodoPaymentsGateway";
import { registerWhopPaymentGateway } from "../whopPaymentGateway";
import { registerAdsGateway } from "../adsGateway";
import { registerThradGateway } from "../thradGateway";
import { startDiscordBotService } from "../discordBotService";
import { isRequestPayloadTooLarge, requestPayloadTooLargeResponse, TOKENFORGE_JSON_BODY_LIMIT } from "../requestPayload";
import {
  globalIpRateLimit,
  orderCreationRateLimit,
  solanaPriceRateLimit,
  trpcRateLimit,
  inferenceIpRateLimit,
} from "../rateLimiters";
import { appRouter } from "../routers";
import { clearLegacyAdministratorRoles, ensureCatalogue, loadAndCacheModelPricingOverrides, ensureDefaultCompactScalingConfigs, ensureReviewerAccount } from "../db";
import { hydrateIdentityWatchTerms } from "../universalModelProviders";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Claude Code sends complete tool and conversation histories. Keep a generous
  // but bounded request size so valid long-running sessions do not fail locally.
  app.use(
    express.json({
      limit: TOKENFORGE_JSON_BODY_LIMIT,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ limit: TOKENFORGE_JSON_BODY_LIMIT, extended: true }));
  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isRequestPayloadTooLarge(error)) return next(error);
    return res.status(413).json(requestPayloadTooLargeResponse(req.path));
  });
  // Allow browser SDK consumers to call the OpenAI-compatible endpoints with Bearer keys.
  // Rejects "null" origins explicitly; credentials are never permitted (credentials: false).
  app.use(
    "/v1",
    cors({
      origin: (origin, callback) => {
        if (origin === "null") {
          return callback(new Error("CORS origin null rejected"));
        }
        return callback(null, true);
      },
      credentials: false,
    })
  );

  // Healthcheck endpoint for container ingress and monitoring
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Direct handler for /favicon.ico for Googlebot, search engines, and browsers
  app.get("/favicon.ico", (_req, res) => {
    const candidatePaths = [
      path.resolve(import.meta.dirname, "../../client/public/favicon.ico"),
      path.resolve(import.meta.dirname, "../public/favicon.ico"),
      path.resolve(import.meta.dirname, "public/favicon.ico"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        res.setHeader("Content-Type", "image/x-icon");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(p);
      }
    }
    res.status(404).end();
  });

  // Direct handler for /ads.txt for IAB verification, Thrad, and programmatic DSP crawlers
  app.get("/ads.txt", (_req, res) => {
    const candidatePaths = [
      path.resolve(import.meta.dirname, "../../client/public/ads.txt"),
      path.resolve(import.meta.dirname, "../public/ads.txt"),
      path.resolve(import.meta.dirname, "public/ads.txt"),
      path.resolve(process.cwd(), "client/public/ads.txt"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.sendFile(p);
      }
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send("thrad.ai, THRAD_PENDING_VERIFICATION, DIRECT\n");
  });

  // Global baseline protection against Layer 7 volumetric floods (2400 req/min)
  app.use(globalIpRateLimit);

  // IP throttling for unauthenticated auth flows: OAuth starts, admin passcode
  // attempts, and model discovery. Protects against credential stuffing and
  // scraping since these endpoints have no per-account rate limit of their own.
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests from this IP. Please try again later." },
  });
  app.use("/api/auth", authRateLimit);

  // Order creation rate limit (10 req/min) across Solana, UPI, and Dodo rails
  app.use(
    [
      "/api/solana-pay/create-order",
      "/api/payments/solana/create-order",
      "/api/upi/create-order",
      "/api/payments/upi/create-order",
      "/api/cashfree/create-order",
      "/api/payments/cashfree/create-order",
      "/api/payments/create-checkout-session",
    ],
    orderCreationRateLimit
  );

  // Solana spot price rate limit (30 req/min)
  app.use("/api/solana-pay/price", solanaPriceRateLimit);

  // Inference endpoints IP rate limit (60 req/min)
  app.use(["/v1/chat/completions", "/v1/messages", "/api/playground/chat/completions"], inferenceIpRateLimit);

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGoogleOAuthRoutes(app);
  registerGitHubOAuthRoutes(app);
  registerDiscordOAuthRoutes(app);
  registerLiveRequestRoutes(app);
  registerOpenAiGateway(app);
  registerAnthropicMessagesGateway(app);
  registerPlaygroundGateway(app);
  registerManagedFailureLogRetention(app);
  registerSolanaPayGateway(app);
  registerUpiPayGateway(app);
  registerCashfreeGateway(app);
  registerDodoPaymentsGateway(app);
  registerWhopPaymentGateway(app);
  registerAdsGateway(app);
  registerThradGateway(app);
  // tRPC API with rate limiting (120 req/min)
  app.use(
    "/api/trpc",
    trpcRateLimit,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[Qronos AI] Port ${port} is in use, retrying in 1 second...`);
      setTimeout(() => {
        try {
          server.close();
        } catch {
          // ignore
        }
        server.listen(port, "0.0.0.0");
      }, 1000);
    } else {
      console.error("[Qronos AI] Server error:", err);
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });

  const shutdown = () => {
    try {
      server.close(() => {
        process.exit(0);
      });
    } catch {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Saved per-model identity watch lists must be active from the first request,
  // not only after an administrator opens the Providers page.
  Promise.all([
    ensureCatalogue(),
    clearLegacyAdministratorRoles(),
    loadAndCacheModelPricingOverrides(),
    ensureReviewerAccount().catch(error => {
      console.warn("[Qronos AI] Reviewer account seed notice:", error);
    }),
    ensureDefaultCompactScalingConfigs().catch(error => {
      console.error("[Qronos AI] Default compact scaling seed failed:", error);
    }),
    hydrateIdentityWatchTerms().catch(error => {
      console.error("[Qronos AI] Identity watch list warmup failed; lists reload when an administrator opens Providers", error);
    }),
  ]).catch(error => {
    console.error("[Qronos AI] Startup access and catalogue warmup failed; requests will retry catalogue initialization on demand", error);
  });

  // Start Discord AI Companion service (runs in background on Azure VM, $0 extra cost)
  void startDiscordBotService().catch(error => {
    console.error("[Qronos AI] Discord Bot service start failed:", error);
  });
}

startServer().catch(console.error);
