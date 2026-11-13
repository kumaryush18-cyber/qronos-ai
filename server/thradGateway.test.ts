import { describe, expect, it } from "vitest";
import { fetchThradBid } from "./thradGateway";

describe("thradGateway", () => {
  it("returns null when no API key is provided", async () => {
    const ad = await fetchThradBid(
      { summary: "test question", messages: [{ role: "user", content: "test" }] },
      { ip: "127.0.0.1", userAgent: "test-agent", country: "US" },
      "", // empty API key
      true
    );
    expect(ad).toBeNull();
  });

  it("handles timeout or network failure gracefully without throwing", async () => {
    const ad = await fetchThradBid(
      { summary: "test question", messages: [{ role: "user", content: "test" }] },
      { ip: "127.0.0.1", userAgent: "test-agent", country: "US" },
      "dummy_key_123",
      true
    );
    // Since dummy key against staging endpoint will return error/null, must not throw
    expect(ad).toBeNull();
  });
});
