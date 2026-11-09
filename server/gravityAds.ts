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

const DEFAULT_SANDBOX_AD: GravityAdItem = {
  brandName: "Neon Serverless Postgres",
  title: "Serverless Postgres with Instant Branching",
  adText: "Scale to zero and branch your database like code. Built for modern AI applications.",
  cta: "Try Free",
  url: "https://neon.tech",
  favicon: "https://neon.tech/favicon/favicon.png",
};

export async function fetchGravityAd(
  messages: Array<{ role: string; content: string }>,
  clientIp?: string
): Promise<GravityAdItem | null> {
  const apiKey = process.env.GRAVITY_API_KEY;
  if (!apiKey) {
    return DEFAULT_SANDBOX_AD;
  }

  try {
    const payload = {
      messages: (messages && messages.length > 0 ? messages.slice(-3) : [{ role: "user", content: "AI application development" }]).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 500),
      })),
      sessionId: `qronos_sess_${Date.now()}`,
      placements: [{ placement: "below_response", placement_id: "playground_main" }],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch("https://server.trygravity.ai/api/v1/ad", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.status === 204 || !response.ok) {
      // In sandbox/testing mode, return the default sponsored test ad
      return DEFAULT_SANDBOX_AD;
    }

    const data = await response.json();
    const ads = Array.isArray(data) ? data : (data?.ads || []);
    if (ads.length > 0) {
      const ad = ads[0];
      return {
        adText: ad.adText || ad.text || DEFAULT_SANDBOX_AD.adText,
        title: ad.title || DEFAULT_SANDBOX_AD.title,
        cta: ad.cta || DEFAULT_SANDBOX_AD.cta,
        brandName: ad.brandName || ad.brand || DEFAULT_SANDBOX_AD.brandName,
        url: ad.clickUrl || ad.url || DEFAULT_SANDBOX_AD.url,
        favicon: ad.favicon || DEFAULT_SANDBOX_AD.favicon,
        brandImage: ad.brandImage || ad.image,
        impUrl: ad.impUrl,
        clickUrl: ad.clickUrl || ad.url,
      };
    }

    return DEFAULT_SANDBOX_AD;
  } catch (err) {
    console.warn("[Gravity Ads] Fetching ad fallback:", err);
    return DEFAULT_SANDBOX_AD;
  }
}
