import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { fetchGravityAd } from "./gravityAds";
import { fetchThradBid } from "./thradGateway";

/**
 * Ad gateway providing endpoints for Qronos CLI and terminal sessions:
 * - GET /ads/next (or /api/ads/next)
 * - POST /ads/impression (or /api/ads/impression)
 */
export function registerAdsGateway(app: Express) {
  // GET /ads/next - called by Qronos CLI between turns to fetch the next sponsor card
  const handleAdNext = async (req: Request, res: Response) => {
    try {
      const clientIp = ((req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "").split(",")[0]?.trim();
      const slot = (req.query.slot as string) || "inline";
      const userAgent = req.headers["user-agent"] || "";
      const country = (req.headers["cf-ipcountry"] as string) || (req.headers["x-country"] as string) || "US";

      // Contextual prompt from query or headers if provided
      const prompt = (req.query.prompt as string) || (req.headers["x-user-prompt"] as string) || "Coding and AI tools";

      // 1. Try Thrad programmatic ad if API key is configured
      if (process.env.THRAD_API_KEY) {
        const thradAd = await fetchThradBid(
          {
            summary: prompt,
            keywords: ["developer tools", "coding", "software engineering"],
            messages: [{ role: "user", content: prompt }],
          },
          { ip: clientIp, userAgent, country }
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

      // 2. Fallback to Gravity sponsor network
      const messages = [{ role: "user", content: prompt }];
      const ad = await fetchGravityAd(messages, clientIp);

      if (!ad) {
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
        click_url: ad.clickUrl || ad.url || "https://trygravity.ai",
        source: "gravity",
        imp_url: ad.impUrl || "https://trygravity.ai",
        placement: slot,
      });
    } catch (err) {
      console.warn("[Ads Gateway] /ads/next error:", err);
      return res.status(204).end();
    }
  };

  // POST /ads/impression - best-effort impression tracking
  const handleImpression = async (req: Request, res: Response) => {
    try {
      // Return 200 OK
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(200).json({ ok: true });
    }
  };

  app.get("/ads/next", handleAdNext);
  app.get("/api/ads/next", handleAdNext);
  app.post("/ads/impression", handleImpression);
  app.post("/api/ads/impression", handleImpression);
}
