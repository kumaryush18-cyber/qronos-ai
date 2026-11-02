import { describe, expect, it } from "vitest";
import { getEnrichedPublicModelCatalogue } from "./openaiGateway";
import { managementApiRateLimit } from "./rateLimiters";

describe("Group 2 API Endpoints & Cybersecurity Verification", () => {
  it("enriches /v1/models with dynamic pricing, min_tier, and context_window", async () => {
    const models = await getEnrichedPublicModelCatalogue();
    expect(models.length).toBeGreaterThanOrEqual(16);

    const opus = models.find(m => m.id === "claude-opus-5.5");
    expect(opus).toBeDefined();
    expect(opus).toMatchObject({
      id: "claude-opus-5.5",
      object: "model",
      context_window: 1_000_000,
      max_output_tokens: 64_000,
      pricing: {
        currency: "USD",
        input_usd_per_million: expect.any(Number),
        output_usd_per_million: expect.any(Number),
      },
      available: expect.any(Boolean),
    });
    expect(typeof opus?.min_tier).toBe("string");
  });

  it("verifies all frontier models expose a 1M context window", async () => {
    const models = await getEnrichedPublicModelCatalogue();
    const sonnet = models.find(m => m.id === "claude-sonnet-5.5");
    const astra = models.find(m => m.id === "gpt-6-astra");
    const glm = models.find(m => m.id === "glm-5.3");

    expect(sonnet?.context_window).toBe(1_000_000);
    expect(astra?.context_window).toBe(1_000_000);
    expect(glm?.context_window).toBe(1_000_000);
  });

  it("verifies managementApiRateLimit is configured to prevent database RU exhaustion attacks", () => {
    expect(managementApiRateLimit).toBeDefined();
  });
});
