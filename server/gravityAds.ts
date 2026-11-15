import { Gravity } from "@gravity-ai/api";

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

export async function fetchGravityAd(
  messages: Array<{ role: string; content: string }>,
  clientIp?: string,
  incomingGravityContext?: any,
  slot: "inline" | "banner" | string = "inline"
): Promise<GravityAdItem | null> {
  try {
    const formattedMessages =
      messages && messages.length > 0
        ? messages.slice(-5).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || "").slice(0, 500),
          }))
        : [{ role: "user", content: "AI application development, developer tools, and database infrastructure" }];

    // Forward the real CLI terminal pixel context or construct compliant fallback
    const gravityContext = incomingGravityContext || {
      sessionId: `gr_sess_${Date.now()}`,
      user: {
        userId: `qronos_user_${(clientIp || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`,
      },
      device: {
        ua: "qronos-cli/1.0.0 (Linux; x86_64)",
        ip: clientIp || "20.198.88.150",
        device_type: "desktop",
        os: "linux",
      },
    };

    const reqMock = {
      headers: {
        ...(clientIp ? { "x-forwarded-for": clientIp, "x-real-ip": clientIp } : {}),
      },
      body: {
        gravity_context: gravityContext,
      },
    };

    // Align with registered dashboard placement IDs ('inline_response' and 'below_response' with id 'main')
    const placementType = slot === "inline" ? "inline_response" : "below_response";
    const placementConfig = [{ placement: placementType, placement_id: "main" }];
    const { live } = getGravityClients();

    // 1. Attempt Live Monetized Auction Only
    try {
      const liveRes = await live.getAds(reqMock, formattedMessages, placementConfig);
      const liveAds = liveRes?.ads || [];
      if (liveAds.length > 0) {
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
          placement: ad.placement || placementType,
          isTest: false,
        };
      }
    } catch (liveErr) {
      console.warn("[Gravity Ads] Live auction attempt error:", liveErr);
    }

    // No live billable sponsor returned: return null so no fake test ad is shown
    return null;
  } catch (err) {
    console.warn("[Gravity Ads] Fetching ad error:", err);
    return null;
  }
}
