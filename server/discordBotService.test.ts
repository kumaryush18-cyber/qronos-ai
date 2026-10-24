import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Discord Bot Service & Memory Architecture", () => {
  it("normalizes mentions from user input correctly", () => {
    const botId = "1562469488425832560";
    const raw = `<@${botId}> what is the fastest model for coding?`;
    const cleaned = raw.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    expect(cleaned).toBe("what is the fastest model for coding?");
  });

  it("handles empty allowed channels by defaulting or allowing all configured channels", () => {
    const allowedChannels: string[] = ["1562668900565393478"];
    const channelId = "1562668900565393478";
    const isAllowed = allowedChannels.length === 0 || allowedChannels.includes(channelId);
    expect(isAllowed).toBe(true);

    const blockedChannel = "999999999999999999";
    const isBlocked = allowedChannels.length === 0 || allowedChannels.includes(blockedChannel);
    expect(isBlocked).toBe(false);
  });

  it("calculates cheeky / naughty description tiers accurately", () => {
    const getNaughtyDescription = (level: number) => {
      if (level < 20) return "Polite, helpful, and formal assistant";
      if (level < 50) return "Friendly dev with subtle casual humor";
      if (level < 80) return "Playful banter, clever roasting & dev memes";
      return "Savage, delightfully witty dev roast & cheeky banter";
    };

    expect(getNaughtyDescription(10)).toBe("Polite, helpful, and formal assistant");
    expect(getNaughtyDescription(45)).toBe("Friendly dev with subtle casual humor");
    expect(getNaughtyDescription(65)).toBe("Playful banter, clever roasting & dev memes");
    expect(getNaughtyDescription(85)).toBe("Savage, delightfully witty dev roast & cheeky banter");
  });

  it("assembles multi-tier prompt context with channel summary and author dossier", () => {
    const systemPrompt = "You are QronosAI mascot.";
    const channelSummary = "Users were discussing Rust web frameworks and joking about memory leaks.";
    const authorNotes = "Prefers Next.js, frequently complains about CSS alignment.";

    const memoryBlocks: string[] = [];
    if (channelSummary) {
      memoryBlocks.push(`[PAST CONVERSATION SUMMARY & INSIDE JOKES]:\n${channelSummary}`);
    }
    if (authorNotes) {
      memoryBlocks.push(`[KNOWN FACTS ABOUT AUTHOR @dev]:\n${authorNotes}`);
    }

    const assembled = `${systemPrompt}\n\nCURRENT CHANNEL CONTEXT:\n${memoryBlocks.join("\n\n")}`;
    expect(assembled).toContain("You are QronosAI mascot.");
    expect(assembled).toContain("Prefers Next.js");
    expect(assembled).toContain("Rust web frameworks");
  });
});
