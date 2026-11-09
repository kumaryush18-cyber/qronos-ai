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
}

const DEFAULT_GRAVITY_KEY = "VXqVCyZ719YV7Q2TIpzuqh0zqBxpszI0xb-Cq-MDYnU";

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
};

// Initialize the official Gravity AI SDK.
// alwaysReturn: true ensures Gravity always serves a contextual test ad during platform review.
const gravity = new Gravity({
  apiKey: process.env.GRAVITY_API_KEY || DEFAULT_GRAVITY_KEY,
  alwaysReturn: true,
});

export async function fetchGravityAd(
  messages: Array<{ role: string; content: string }>,
  clientIp?: string
): Promise<GravityAdItem | null> {
  try {
    const formattedMessages = messages && messages.length > 0
      ? messages.slice(-5).map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "").slice(0, 500),
        }))
      : [{ role: "user", content: "AI application development, developer tools, and database infrastructure" }];

    const reqMock = {
      headers: {
        ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
      },
      body: {
        gravity_context: {
          sessionId: `qronos_sess_${Date.now()}`,
          user: { userId: `qronos_user_${(clientIp || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}` },
        },
      },
    };

    const res = await gravity.getAds(reqMock, formattedMessages, [
      { placement: "below_response", placement_id: "playground_main" },
    ]);

    const ads = res?.ads || [];
    if (ads.length > 0) {
      const ad = ads[0] as any;
      return {
        adText: ad.adText || ad.text || DEFAULT_SANDBOX_AD.adText,
        title: ad.title || ad.brandName || DEFAULT_SANDBOX_AD.title,
        cta: ad.cta || DEFAULT_SANDBOX_AD.cta,
        brandName: ad.brandName || ad.brand || "Sponsored Partner",
        url: ad.clickUrl || ad.url || DEFAULT_SANDBOX_AD.url,
        favicon: ad.favicon || DEFAULT_SANDBOX_AD.favicon,
        brandImage: ad.brandImage || ad.image || DEFAULT_SANDBOX_AD.brandImage,
        impUrl: ad.impUrl || "https://trygravity.ai",
        clickUrl: ad.clickUrl || ad.url || DEFAULT_SANDBOX_AD.url,
        placement: ad.placement || "below_response",
      };
    }

    return DEFAULT_SANDBOX_AD;
  } catch (err) {
    console.warn("[Gravity Ads] Fetching ad fallback:", err);
    return DEFAULT_SANDBOX_AD;
  }
}
