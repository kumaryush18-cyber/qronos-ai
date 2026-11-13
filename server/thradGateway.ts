// Thrad AI DSP & SSP Integration for Qronos AI
// Implements Thrad v2 Bid Request Contract (https://docs.thrad.ai/api/api-reference/bid-request-v2)
// Supports native conversational cards, sponsored intelligence, and IAB viewability compliance.

import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import axios from "axios";

export interface ThradDeviceMetadata {
  ip?: string;
  userAgent?: string;
  country?: string;
  type?: "desktop" | "mobile" | "tablet" | "other";
  os?: string;
}

export interface ThradContextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ThradContext {
  id?: string;
  summary?: string;
  keywords?: string[];
  messages?: ThradContextMessage[];
}

export interface ThradAdCard {
  bidId: string;
  title: string;
  description: string;
  imageUrl?: string;
  brandName?: string;
  brandLogoUrl?: string;
  ctaText: string;
  clickUrl: string;
  renderedTrackerUrl?: string;
  viewableTrackerUrl?: string;
}

const THRAD_TIMEOUT_MS = 6000;

function inferDeviceType(userAgent?: string): "desktop" | "mobile" | "tablet" | "other" {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
  return "desktop";
}

function inferDeviceOs(userAgent?: string): string {
  if (!userAgent) return "other";
  const ua = userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  return "other";
}

/** Mask basic email and phone PII to comply with Thrad's safety standard */
function maskPII(text: string): string {
  if (!text) return "";
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
    .replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE_REDACTED]");
}

export async function fetchThradBid(
  context: ThradContext,
  deviceMeta: ThradDeviceMetadata,
  apiKey: string = process.env.THRAD_API_KEY || "",
  isStaging: boolean = (process.env.THRAD_ENV || "staging") === "staging"
): Promise<ThradAdCard | null> {
  if (!apiKey) {
    return null;
  }

  const endpoint = isStaging
    ? "https://api.staging.thrad.ai/v2/bid"
    : "https://api.thrad.ai/v2/bid";

  const sanitizedMessages = (context.messages || []).map((m) => ({
    role: m.role,
    content: maskPII(m.content),
    timestamp: Math.floor(Date.now() / 1000),
  }));

  const userAgent = deviceMeta.userAgent || "Mozilla/5.0";
  const deviceType = deviceMeta.type || inferDeviceType(userAgent);
  const deviceOs = deviceMeta.os || inferDeviceOs(userAgent);

  const payload = {
    version: "2.0",
    id: `qronos_req_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    context: {
      id: context.id || `chat_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      flow: "chat",
      chat: {
        messages: sanitizedMessages.slice(-4), // Last 4 turns
        turn_number: Math.max(1, sanitizedMessages.length),
      },
      summary: context.summary || "Developer asking about software engineering, AI models, and coding tools.",
      keywords: context.keywords || ["developer tools", "cloud computing", "artificial intelligence"],
    },
    device: {
      type: deviceType,
      os: deviceOs,
      ip: deviceMeta.ip,
      user_agent: userAgent,
      geo: {
        country: deviceMeta.country || "US",
      },
    },
    opportunities: [
      {
        id: `opp_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        formats: [
          {
            type: "card",
            assets: {
              title: { max_chars: 90 },
              description: { max_chars: 160 },
              image: {},
            },
          },
        ],
      },
    ],
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: THRAD_TIMEOUT_MS,
    });

    const bids = response.data?.bids || response.data?.opportunities?.[0]?.bids;
    if (!bids || !Array.isArray(bids) || bids.length === 0) {
      return null;
    }

    const winningBid = bids[0];
    const assets = winningBid.assets || {};
    const trackers = winningBid.trackers || [];

    // Find rendered and viewable tracker URLs
    let renderedUrl: string | undefined;
    let viewableUrl: string | undefined;

    for (const tracker of trackers) {
      if (tracker.event === "rendered" && tracker.url) renderedUrl = tracker.url;
      if (tracker.event === "viewable" && tracker.url) viewableUrl = tracker.url;
    }

    const actions = winningBid.actions || {};
    const clickUrl = actions.click?.url || actions.destination?.url || winningBid.click_url || "#";

    return {
      bidId: winningBid.id || `bid_${randomUUID().slice(0, 8)}`,
      title: assets.title?.text || "Featured Partner",
      description: assets.description?.text || "Next-generation developer infrastructure.",
      imageUrl: assets.image?.url,
      brandName: winningBid.advertiser?.name || "Sponsored Partner",
      brandLogoUrl: winningBid.advertiser?.logo_url,
      ctaText: assets.cta?.text || "Learn More",
      clickUrl,
      renderedTrackerUrl: renderedUrl,
      viewableTrackerUrl: viewableUrl,
    };
  } catch (err: any) {
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      console.warn("[Thrad Gateway] Bid request timed out (>= 6000ms), skipping gracefully.");
    } else {
      console.warn("[Thrad Gateway] Bid request error:", err.response?.status, err.response?.data || err.message);
    }
    return null;
  }
}

export function registerThradGateway(app: Express) {
  // POST /api/ads/thrad/bid: Fetches a native sponsored intelligence card for playground chat turns
  app.post("/api/ads/thrad/bid", async (req: Request, res: Response) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"] || "";
      const country = (req.headers["cf-ipcountry"] as string) || (req.headers["x-country"] as string) || "US";

      const { prompt, assistantResponse, chatId } = req.body || {};

      const context: ThradContext = {
        id: chatId || `qronos_chat_${randomUUID().slice(0, 8)}`,
        summary: prompt ? `User inquiry: ${prompt.slice(0, 120)}` : "Developer inquiry",
        keywords: ["developer tools", "coding", "software engineering"],
        messages: [
          ...(prompt ? [{ role: "user" as const, content: prompt }] : []),
          ...(assistantResponse ? [{ role: "assistant" as const, content: assistantResponse.slice(0, 300) }] : []),
        ],
      };

      const deviceMeta: ThradDeviceMetadata = {
        ip: clientIp,
        userAgent,
        country,
      };

      const ad = await fetchThradBid(context, deviceMeta);
      if (!ad) {
        return res.status(204).end();
      }

      return res.status(200).json(ad);
    } catch (err) {
      console.error("[Thrad Gateway] /api/ads/thrad/bid error:", err);
      return res.status(204).end();
    }
  });

  // GET /api/ads/thrad/status: Diagnostic health check
  app.get("/api/ads/thrad/status", (_req: Request, res: Response) => {
    const hasKey = Boolean(process.env.THRAD_API_KEY);
    const env = process.env.THRAD_ENV || "staging";
    return res.status(200).json({
      active: true,
      provider: "thrad.ai",
      environment: env,
      hasKey,
      adsTxtEndpoint: "https://qronos.me/ads.txt",
    });
  });
}
