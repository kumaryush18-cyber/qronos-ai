import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { fetchGravityAd } from "./gravityAds";
import { fetchThradBid } from "./thradGateway";
import { logAdMiss, adMissLine } from "./adsDiagnostics";
import { recordImpression } from "./adImpressions";
import {
  AD_MESSAGES_HEADER,
  AD_USER_HASH_HEADER,
  clientIpFrom,
  decodeMessagesHeader,
  emailHashOf,
  sanitizeMessages,
} from "./adRequest";

/**
 * A pixel URL we are willing to fire: https, and a host Gravity or Thrad owns.
 * A bare host with no path is not an impression endpoint, so it is refused.
 */
function realImpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.pathname === "/" && !url.search) return false;
    return /(^|\.)trygravity\.(ai|com)$/.test(url.hostname) || /(^|\.)thrad\.ai$/.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Ad gateway providing endpoints for Qronos CLI and terminal sessions:
 * - GET /ads/next (or /api/ads/next)
 * - POST /ads/impression (or /api/ads/impression)
 */
export function registerAdsGateway(app: Express) {
  // GET /ads/next - called by Qronos CLI between turns to fetch the next sponsor card
  const handleAdNext = async (req: Request, res: Response) => {
    try {
      const clientIp = clientIpFrom(req.headers as Record<string, unknown>, req.socket.remoteAddress);
      const slot = (req.query.slot as string) || "inline";
      const userAgent = req.headers["user-agent"] || "";
      const country = (req.headers["cf-ipcountry"] as string) || (req.headers["x-country"] as string) || "";

      // The CLI sends its real turns in one base64url header; a bare `prompt` is
      // only kept for an old client that has nothing better to offer.
      const conversation = decodeMessagesHeader(req.headers[AD_MESSAGES_HEADER]);
      const prompt = (req.query.prompt as string) || (req.headers["x-user-prompt"] as string) || "Coding and AI tools";
      const messages = conversation.length > 0 ? conversation : sanitizeMessages([{ role: "user", content: prompt }]);
      const emailHash = emailHashOf(req.headers[AD_USER_HASH_HEADER]);
      const surface = (req.query.surface as string) === "web" ? "web" : "cli";

      // 1. Try Thrad programmatic ad if API key is configured
      if (process.env.THRAD_API_KEY) {
        const thradAd = await fetchThradBid(
          {
            summary: messages[0]?.content || prompt,
            keywords: ["developer tools", "coding", "software engineering"],
            messages,
          },
          { ip: clientIp, userAgent, country: country || undefined }
        );

        if (thradAd) {
          const adId = `thrad_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const clickToken = `ct_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

          return res.status(200).json({
            ad_id: adId,
            click_token: clickToken,
            creative: {
              headline: thradAd.brandName ? `${thradAd.brandName}: ${thradAd.title}` : thradAd.title,
              body: thradAd.description,
              cta: thradAd.ctaText || "Learn More",
              accent: "#c9ff73",
            },
            click_url: thradAd.clickUrl,
            source: "thrad",
            imp_url: thradAd.viewableTrackerUrl || thradAd.renderedTrackerUrl || "https://api.thrad.ai",
            placement: slot,
          });
        }
      }

      // Extract client Gravity context forwarded by Qronos CLI (base64url JSON)
      let incomingGravityContext: any = undefined;
      const rawGravityHeader = req.headers["x-gravity-context"];
      if (typeof rawGravityHeader === "string" && rawGravityHeader.trim()) {
        try {
          incomingGravityContext = JSON.parse(Buffer.from(rawGravityHeader, "base64url").toString("utf8"));
        } catch {
          try {
            incomingGravityContext = JSON.parse(Buffer.from(rawGravityHeader, "base64").toString("utf8"));
          } catch {}
        }
      }

      // 2. Fallback to Gravity sponsor network, with the real conversation and a
      // placement id that actually exists in the dashboard.
      const ad = await fetchGravityAd(messages, clientIp, incomingGravityContext, slot, {
        surface,
        headers: req.headers as Record<string, unknown>,
        emailHash,
      });

      if (!ad) {
        // One line that names both networks, so nobody has to guess which one ran.
        // `thrad=off` is the common case: its key is not in the deploy env list.
        const miss = adMissLine({
          slot,
          source: "gravity",
          fill: 0,
          keyPresent: Boolean(process.env.GRAVITY_API_KEY),
          extra: {
            thrad: process.env.THRAD_API_KEY ? "on" : "off",
            country: country || "unknown",
            geoHeader: req.headers["cf-ipcountry"] ? "cf" : req.headers["x-country"] ? "x" : "none",
            msgs: String(messages.length),
            surface,
          },
        });
        logAdMiss({
          slot,
          source: "gravity",
          fill: 0,
          keyPresent: Boolean(process.env.GRAVITY_API_KEY),
        });
        // Only a request that asked for it gets the reason back, so an ordinary
        // user never receives a line about our ad plumbing.
        if (req.headers["x-ad-debug"] === "1") res.setHeader("x-ad-miss", miss);
        return res.status(204).end();
      }

      const adId = `ad_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const clickToken = `ct_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

      // Return format compatible with Qronos CLI / pi-ads AdNextResponse schema
      return res.status(200).json({
        ad_id: adId,
        click_token: clickToken,
        creative: {
          headline: ad.brandName || ad.title || "Featured Partner",
          body: ad.adText || "Modern developer tools and cloud infrastructure.",
          cta: ad.cta || "Learn More",
          accent: "#c9ff73",
        },
        click_url: ad.clickUrl || ad.url || "",
        source: "gravity",
        // Only a real pixel URL is returned. A made-up one would make the client
        // fire an impression that never happened, which is the opposite of what
        // the network asked for.
        ...(realImpUrl(ad.impUrl) ? { imp_url: ad.impUrl } : {}),
        placement: slot,
      });
    } catch (err) {
      console.warn("[Ads Gateway] /ads/next error:", err);
      return res.status(204).end();
    }
  };

  // POST /ads/impression - one honest record per drawn ad
  const handleImpression = async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        ad_id?: unknown;
        placement?: unknown;
        source?: unknown;
        imp_fired?: unknown;
      };
      const counted = recordImpression({
        adId: typeof body.ad_id === "string" ? body.ad_id : "",
        slot: typeof body.placement === "string" ? body.placement : undefined,
        source: typeof body.source === "string" ? body.source : "gravity",
        pixelFired: body.imp_fired === true,
      });
      // A repeat is still a 200: the client did nothing wrong, it just repainted.
      return res.status(200).json({ ok: true, counted });
    } catch {
      return res.status(200).json({ ok: true, counted: false });
    }
  };

  app.get("/ads/next", handleAdNext);
  app.get("/api/ads/next", handleAdNext);
  app.post("/ads/impression", handleImpression);
  app.post("/api/ads/impression", handleImpression);

  // POST /api/ads/gravity - pure Gravity SDK ad route for Playground and Dashboard
  app.post("/api/ads/gravity", async (req: Request, res: Response) => {
    try {
      const clientIp = clientIpFrom(req.headers as Record<string, unknown>, req.socket.remoteAddress);
      const { messages: bodyMessages = [], placement = "below_response", placement_id, surface: bodySurface } = req.body || {};

      const ad = await fetchGravityAd(
        sanitizeMessages(bodyMessages),
        clientIp,
        undefined,
        placement === "inline_response" ? "inline" : "banner",
        {
          surface: bodySurface === "cli" ? "cli" : "web",
          headers: req.headers as Record<string, unknown>,
          emailHash: emailHashOf(req.headers[AD_USER_HASH_HEADER]),
          placementId: typeof placement_id === "string" && placement_id.trim() ? placement_id.trim() : undefined,
        },
      );
      if (!ad) {
        return res.status(200).json({ ads: [] });
      }

      return res.status(200).json({
        ads: [
          {
            adText: ad.adText,
            title: ad.title || ad.brandName,
            cta: ad.cta || "Learn More",
            brandName: ad.brandName || "Sponsored Partner",
            url: ad.clickUrl || ad.url,
            clickUrl: ad.clickUrl || ad.url,
            impUrl: ad.impUrl,
            brandImage: ad.brandImage,
            favicon: ad.favicon,
            placement: ad.placement,
            placement_id: ad.placement,
          },
        ],
      });
    } catch (err) {
      console.warn("[Ads Gateway] /api/ads/gravity error:", err);
      return res.status(200).json({ ads: [] });
    }
  });
}
