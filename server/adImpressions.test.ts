import { beforeEach, describe, expect, it } from "vitest";

import { impressionStats, recentImpressions, recordImpression, resetImpressions } from "./adImpressions";

describe("impression records", () => {
  beforeEach(() => resetImpressions());

  it("counts one impression per ad", () => {
    expect(recordImpression({ adId: "ad_1", slot: "banner", source: "gravity", pixelFired: true })).toBe(true);
    expect(impressionStats().total).toBe(1);
  });

  it("refuses to count the same ad twice, so a repaint is not revenue", () => {
    recordImpression({ adId: "ad_1" });
    expect(recordImpression({ adId: "ad_1" })).toBe(false);
    expect(impressionStats().total).toBe(1);
    expect(impressionStats().duplicates).toBe(1);
  });

  it("refuses an empty ad id", () => {
    expect(recordImpression({ adId: "  " })).toBe(false);
  });

  it("stamps the time itself, never from the caller", () => {
    recordImpression({ adId: "ad_2", now: 1_700_000_000_000 });
    expect(recentImpressions(1)[0]!.at).toBe(1_700_000_000_000);
  });

  it("counts a pixel that was never fired separately", () => {
    recordImpression({ adId: "ad_3", pixelFired: false });
    recordImpression({ adId: "ad_4", pixelFired: true });
    expect(impressionStats().pixelFired).toBe(1);
  });

  it("keeps the newest events in the ring", () => {
    for (let i = 0; i < 250; i += 1) recordImpression({ adId: `ad_${i}` });
    const recent = recentImpressions(20);
    expect(recent).toHaveLength(20);
    expect(recent.at(-1)!.adId).toBe("ad_249");
    expect(impressionStats().window).toBe(200);
  });

  it("never stores a field it does not know", () => {
    recordImpression({ adId: "ad_5", slot: "banner", source: "gravity", extra: "junk" } as never);
    expect(Object.keys(recentImpressions(1)[0]!).sort()).toEqual(["adId", "at", "pixelFired", "slot", "source"]);
  });

  it("cuts an absurd id, so the ring cannot hold a payload", () => {
    recordImpression({ adId: "z".repeat(500) });
    expect(recentImpressions(1)[0]!.adId).toHaveLength(64);
  });
});
