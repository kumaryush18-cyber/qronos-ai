import { describe, expect, it, vi } from "vitest";
import { buildDiscordAuthorizationUrl, isDiscordGuildMember } from "./discordOAuth";
import { bypassDiscordVerificationByEmail } from "./db";

describe("Discord Verification & Multi-Account Prevention", () => {
  it("builds the correct Discord OAuth2 authorization URL with identify scope", () => {
    const url = new URL(
      buildDiscordAuthorizationUrl({
        clientId: "1562469488425832560",
        redirectUri: "https://qronos.me/api/auth/discord/callback",
        state: "csrf-state-token-123",
      })
    );

    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("1562469488425832560");
    expect(url.searchParams.get("redirect_uri")).toBe("https://qronos.me/api/auth/discord/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("identify");
    expect(url.searchParams.get("state")).toBe("csrf-state-token-123");
  });

  it("confirms server membership via Discord Bot API for active members", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
    const isMember = await isDiscordGuildMember({
      guildId: "1553707015384207453",
      discordUserId: "987654321012345678",
      botToken: "test-bot-token",
      fetchImpl: mockFetch as typeof fetch,
    });

    expect(isMember).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/1553707015384207453/members/987654321012345678",
      { headers: { Authorization: "Bot test-bot-token" } }
    );
  });

  it("rejects non-members gracefully without throwing exceptions", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 404, ok: false });
    const isMember = await isDiscordGuildMember({
      guildId: "1553707015384207453",
      discordUserId: "non-member-user-id",
      botToken: "test-bot-token",
      fetchImpl: mockFetch as typeof fetch,
    });

    expect(isMember).toBe(false);
  });

  it("reports found: false when attempting to bypass verification for a non-existent email", async () => {
    const result = await bypassDiscordVerificationByEmail("non-existent-user-999999@randomdomain.test");
    expect(result.found).toBe(false);
  });
});
