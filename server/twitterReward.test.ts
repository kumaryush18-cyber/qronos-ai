import { describe, it, expect } from "vitest";
import {
  formatTweetExact300,
  getTwitterRewardConfig,
  saveTwitterRewardConfig,
  DEFAULT_TWITTER_REWARD_SLOTS,
} from "./db";

describe("Twitter (X) Share-to-Earn Rewards Engine", () => {
  it("formats all 15 default slot templates to exactly 300 characters with referral code substitution", () => {
    DEFAULT_TWITTER_REWARD_SLOTS.forEach((slot, idx) => {
      const code = `usr${idx}`;
      const tweet = formatTweetExact300(slot.templateText, code, 300);

      expect(tweet.length).toBe(300);
      expect(tweet).toContain(`aff=${code}`);
      expect(tweet).toContain("@QronosAI");
    });
  });

  it("handles variable length referral codes and maintains exact 300 character boundary", () => {
    const slot = DEFAULT_TWITTER_REWARD_SLOTS[0];

    const shortCode = "a";
    const normalCode = "a7xp";
    const longCode = "customsuperaffiliate999";

    const tweet1 = formatTweetExact300(slot.templateText, shortCode, 300);
    const tweet2 = formatTweetExact300(slot.templateText, normalCode, 300);
    const tweet3 = formatTweetExact300(slot.templateText, longCode, 300);

    expect(tweet1.length).toBe(300);
    expect(tweet2.length).toBe(300);
    expect(tweet3.length).toBe(300);
  });

  it("loads default config containing 15 slots and customizable grant parameters", async () => {
    const config = await getTwitterRewardConfig();

    expect(config.enabled).toBe(true);
    expect(config.slots).toHaveLength(15);
    expect(config.cooldownHours).toBe(12);
    expect(typeof config.tokenGrantMillion).toBe("number");
    expect(typeof config.paygGrantDollars).toBe("number");

    // Spot-check key marketing themes
    const themes = config.slots.map((s) => s.title);
    expect(themes).toContain("Wholesale Frontier Models");
    expect(themes).toContain("Free Sonnet 5.5 Access");
    expect(themes).toContain("Solana Pay Native");
    expect(themes).toContain("Domestic UPI Checkout");
    expect(themes).toContain("Cursor & Cline Drop-in");
  });

  it("allows updating token grants, payg grants, and model configuration", async () => {
    const initial = await getTwitterRewardConfig();

    const updatedConfig = {
      ...initial,
      tokenGrantMillion: 50,
      paygGrantDollars: 5,
      selectedModel: "claude-opus-5.5",
    };

    await saveTwitterRewardConfig(updatedConfig);
    const reloaded = await getTwitterRewardConfig();

    expect(reloaded.tokenGrantMillion).toBe(50);
    expect(reloaded.paygGrantDollars).toBe(5);
    expect(reloaded.selectedModel).toBe("claude-opus-5.5");

    // Restore to 30M default
    await saveTwitterRewardConfig({
      ...initial,
      tokenGrantMillion: 30,
      paygGrantDollars: 0,
      selectedModel: "claude-sonnet-5.5",
    });
  });
});
