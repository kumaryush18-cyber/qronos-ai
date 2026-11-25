import { Gravity } from "@gravity-ai/api";
import { adsDebugEnabled, cleanUpstreamMessage, logAdMiss } from "./adsDiagnostics";
import {
  countryFrom,
  placementConfig,
  realDevice,
  requestSummary,
  sanitizeMessages,
  type AdSlot,
  type AdSurface,
  type FakeMessage,
} from "./adRequest";

export interface GravityAdItem {
  adText: string;
  title?: string;
  cta?: string;
  brandName?: string;
  url?: string;
  favicon?: string;
  brandImage?: string;
  impUrl?: string;
  clickUrl?: string;
  placement?: string;
  isTest?: boolean;
}

const DEFAULT_SANDBOX_AD: GravityAdItem = {
  brandName: "Neon Serverless Postgres",
  title: "Serverless Postgres with Instant Branching",
  adText: "Scale to zero and branch your database like code. Built for modern AI applications.",
  cta: "Try Free",
  url: "https://neon.tech",
  favicon: "https://neon.tech/favicon/favicon.png",
  brandImage: "https://neon.tech/favicon/favicon.png",
  clickUrl: "https://neon.tech",
  impUrl: "https://trygravity.ai",
  isTest: true,
};

function getGravityClients() {
  const apiKey = process.env.GRAVITY_API_KEY || "";
  const live = new Gravity({
    apiKey,
    production: true,
    timeoutMs: 4000,
    relevancy: 0.2,
  });
  return { live };
}

export interface GravityAdOptions {
  /** Which product asked: the terminal client or the website. */
  surface?: AdSurface;
  /** The request headers, so the device block can be the real one. */
  headers?: Record<string, unknown>;
  /** A pre-hashed email (64 hex). The raw address never reaches this file. */
  emailHash?: string;
  /** Overrides the env placement id, when a caller already resolved it. */
  placementId?: string;
}

export async function fetchGravityAd(
  messages: Array<{ role: string; content: string }>,
  clientIp?: string,
  incomingGravityContext?: any,
  slot: "inline" | "banner" | string = "inline",
  options: GravityAdOptions = {},
): Promise<GravityAdItem | null> {
  try {
    // The real turns, capped for size only. The SDK itself forwards the last two
    // turns, so there is no reason to pre-chew the conversation into one line.
    const realMessages: FakeMessage[] = sanitizeMessages(messages);
    const formattedMessages =
      realMessages.length > 0
        ? realMessages
        : [{ role: "user" as const, content: "AI application development, developer tools, and database infrastructure" }];

    const placement = placementConfig(options.surface, slot as AdSlot);
    if (options.placementId) placement.placement_id = options.placementId;

    // Forward the real CLI terminal pixel context; build an honest fallback from
    // the client's own headers when there is none.
    const country = countryFrom(options.headers);
    const device = realDevice(options.headers, clientIp);
    const gravityContext = incomingGravityContext || {
      sessionId: `gr_sess_${Date.now()}`,
      user: {
        userId: `qronos_user_${(clientIp || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`,
      },
      device,
      ...(country ? { country } : {}),
    };
    // A pixel context arrives without a device block and without identity. The
    // two facts Gravity asked for are merged in, never overwritten.
    if (incomingGravityContext && typeof incomingGravityContext === "object") {
      if (!gravityContext.device) gravityContext.device = device;
      else if (!gravityContext.device.ua) gravityContext.device.ua = device.ua;
      if (!gravityContext.device.ip && device.ip) gravityContext.device.ip = device.ip;
      if (country && !gravityContext.country) gravityContext.country = country;
      if (options.emailHash) {
        gravityContext.user = { ...(gravityContext.user || {}), hashed_email: options.emailHash };
      }
    }

    const rawUserAgent = options.headers?.["user-agent"];
    const reqMock = {
      headers: {
        ...(clientIp ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp } : {}),
        ...(typeof rawUserAgent === "string" ? { "user-agent": rawUserAgent } : {}),
      },
      body: {
        gravity_context: gravityContext,
      },
    };

    const placementConfigList = [placement];
    const { live } = getGravityClients();

    // 1. Attempt Live Monetized Auction Only
    let fill = 0;
    let upstreamError: unknown;
    let upstreamStatus = 0;
    try {
      const liveRes = await live.getAds(reqMock, formattedMessages, placementConfigList);
      // The SDK hands back the upstream status and any error text; both are the
      // difference between "the network has nothing" and "the network refused us".
      upstreamStatus = liveRes?.status ?? 0;
      if (liveRes?.error) upstreamError = liveRes.error;
      const liveAds = liveRes?.ads || [];
      fill = liveAds.length;
      if (liveAds.length > 0) {
        if (adsDebugEnabled()) {
          console.warn(`[ads] filled slot=${slot} source=gravity fill=${fill} ${requestSummary(formattedMessages, placement.placement_id)}`);
        }
        const ad = liveAds[0] as any;
        return {
          adText: ad.adText || ad.text || "",
          title: ad.title || ad.brandName || "Featured Partner",
          cta: ad.cta || "Learn More",
          brandName: ad.brandName || ad.brand || "Sponsored Partner",
          url: ad.clickUrl || ad.url,
          favicon: ad.favicon,
          brandImage: ad.brandImage || ad.image,
          impUrl: ad.impUrl || "https://trygravity.ai",
          clickUrl: ad.clickUrl || ad.url,
          placement: ad.placement || placement.placement_id,
          isTest: false,
        };
      }
    } catch (liveErr) {
      upstreamError = liveErr;
      console.warn("[Gravity Ads] Live auction attempt error:", cleanUpstreamMessage(liveErr));
    }

    // An empty placement is the normal state of a healthy network, so it is one
    // line, and only when `QRONOS_DEBUG_ADS=1`. A real error is always logged,
    // because a rejected key looks exactly like an empty network otherwise.
    logAdMiss({
      slot,
      source: "gravity",
      fill,
      keyPresent: Boolean(process.env.GRAVITY_API_KEY),
      error: upstreamError,
      loud: Boolean(upstreamError),
      extra: {
        placement: placement.placement_id,
        upstream: String(upstreamStatus),
        msgs: String(formattedMessages.length),
        ...(country ? { country } : {}),
        emailHash: options.emailHash ? "yes" : "no",
      },
    });

    // No live billable sponsor returned: return null so no fake test ad is shown
    return null;
  } catch (err) {
    console.warn("[Gravity Ads] Fetching ad error:", err);
    return null;
  }
}
